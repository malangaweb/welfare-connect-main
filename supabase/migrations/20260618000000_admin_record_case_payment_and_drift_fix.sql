-- Admin tool: record a case payment as a proper transaction row.
-- This ensures both wallet_balance (via DB trigger) AND case progress
-- (via api-member-summary edge function) update correctly.
--
-- WHY THIS EXISTS:
-- Previously, manually editing members.wallet_balance directly would NOT
-- update case progress (paid/amount_paid/unpaid count), because the
-- api-member-summary edge function computes those values from the
-- transactions table, not from members.wallet_balance.
--
-- Use this function instead of direct UPDATE members SET wallet_balance = ...

CREATE OR REPLACE FUNCTION admin_record_case_payment(
  p_admin_id UUID,
  p_member_id UUID,
  p_case_id UUID,
  p_amount NUMERIC,
  p_transaction_type TEXT DEFAULT 'case_wallet_deduction',
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_case RECORD;
  v_existing_net NUMERIC;
  v_required NUMERIC;
  v_description TEXT;
  v_tx_id UUID;
BEGIN
  -- Validate the case exists and is active/finalized
  SELECT id, case_number, contribution_per_member, is_active, is_finalized
  INTO v_case
  FROM public.cases
  WHERE id = p_case_id
    AND (is_active = TRUE OR is_finalized = TRUE);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Case not found or not payable (must be active or finalized)'
    );
  END IF;

  -- Validate member exists
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Member not found');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Amount must be positive');
  END IF;

  -- Validate transaction_type
  IF p_transaction_type NOT IN ('case_wallet_deduction', 'contribution', 'arrears') THEN
    RETURN jsonb_build_object('success', false, 'message',
      'transaction_type must be case_wallet_deduction, contribution, or arrears'
    );
  END IF;

  -- Check existing net paid for this member+case
  SELECT COALESCE(SUM(
    CASE
      WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears')
        THEN ABS(COALESCE(t.amount, 0))
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund')
        THEN -ABS(COALESCE(t.amount, 0))
      ELSE 0
    END
  ), 0) INTO v_existing_net
  FROM public.transactions t
  WHERE t.member_id = p_member_id
    AND t.case_id = p_case_id
    AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success');

  v_required := COALESCE(v_case.contribution_per_member, 0);

  IF v_required > 0 AND v_existing_net >= v_required THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Case #' || v_case.case_number || ' is already fully paid (net: ' || v_existing_net || ', required: ' || v_required || ')'
    );
  END IF;

  -- Build description
  IF p_description IS NOT NULL THEN
    v_description := p_description;
  ELSE
    v_description := 'Admin case payment for case #' || v_case.case_number
      || ' (' || p_transaction_type || ')';
  END IF;

  -- Insert the transaction row
  INSERT INTO public.transactions (
    member_id,
    case_id,
    amount,
    transaction_type,
    status,
    description,
    metadata
  ) VALUES (
    p_member_id,
    p_case_id,
    p_amount,
    p_transaction_type,
    'completed',
    v_description,
    jsonb_build_object(
      'source', 'admin_manual_payment',
      'admin_id', p_admin_id,
      'case_number', v_case.case_number
    )
  )
  RETURNING id INTO v_tx_id;

  -- Log the action
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, metadata)
  VALUES (
    p_admin_id,
    'INSERT',
    'transactions',
    v_tx_id,
    jsonb_build_object(
      'action', 'admin_record_case_payment',
      'member_id', p_member_id,
      'case_id', p_case_id,
      'case_number', v_case.case_number,
      'amount', p_amount,
      'transaction_type', p_transaction_type,
      'existing_net_paid', v_existing_net,
      'required_amount', v_required,
      'is_finalized', v_case.is_finalized
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment recorded for case #' || v_case.case_number,
    'transaction_id', v_tx_id,
    'amount', p_amount,
    'case_number', v_case.case_number,
    'existing_net_paid', v_existing_net,
    'new_net_paid', v_existing_net + p_amount,
    'required_amount', v_required
  );
END;
$$;

COMMENT ON FUNCTION admin_record_case_payment(UUID, UUID, UUID, NUMERIC, TEXT, TEXT) IS
'Records a case payment as a transaction row. This ensures wallet_balance (trigger) and case progress (api-member-summary) both update correctly. Use this instead of direct UPDATE members SET wallet_balance.';

GRANT EXECUTE ON FUNCTION public.admin_record_case_payment(UUID, UUID, UUID, NUMERIC, TEXT, TEXT) TO service_role;

-- Also provide a simpler member-side RPC for paying into the wallet
CREATE OR REPLACE FUNCTION admin_record_wallet_funding(
  p_admin_id UUID,
  p_member_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_mpesa_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx_id UUID;
  v_desc TEXT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Amount must be positive');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Member not found');
  END IF;

  v_desc := COALESCE(p_description, 'Admin wallet funding');

  INSERT INTO public.transactions (
    member_id,
    amount,
    transaction_type,
    status,
    description,
    mpesa_reference,
    metadata
  ) VALUES (
    p_member_id,
    p_amount,
    'wallet_funding',
    'completed',
    v_desc,
    p_mpesa_reference,
    jsonb_build_object(
      'source', 'admin_manual_funding',
      'admin_id', p_admin_id
    )
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, metadata)
  VALUES (
    p_admin_id,
    'INSERT',
    'transactions',
    v_tx_id,
    jsonb_build_object(
      'action', 'admin_record_wallet_funding',
      'member_id', p_member_id,
      'amount', p_amount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'amount', p_amount
  );
END;
$$;

COMMENT ON FUNCTION admin_record_wallet_funding(UUID, UUID, NUMERIC, TEXT, TEXT) IS
'Records wallet funding from admin. Creates a wallet_funding transaction which triggers wallet_balance recalculation.';

GRANT EXECUTE ON FUNCTION public.admin_record_wallet_funding(UUID, UUID, NUMERIC, TEXT, TEXT) TO service_role;

-- Recompute stored wallet balances from the canonical ledger to fix any drift
-- caused by manual members.wallet_balance edits that bypassed the trigger.
UPDATE public.members m
SET wallet_balance = public.calculate_wallet_balance(m.id)
WHERE m.id IS NOT NULL;

-- Trigger: keep cases.actual_amount in sync with the transactions ledger.
-- Previously, cases.actual_amount was a denormalized cache that went stale
-- whenever payments were recorded via bulk_deduct, case_wallet_deduction, etc.
-- This trigger recalculates actual_amount whenever a related transaction row
-- is inserted, updated, or deleted.
CREATE OR REPLACE FUNCTION public.sync_case_actual_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_case_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_case_id := OLD.case_id;
  ELSE
    v_case_id := NEW.case_id;
  END IF;

  IF v_case_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  UPDATE public.cases c
  SET actual_amount = (
    SELECT COALESCE(SUM(
      CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears')
          THEN ABS(COALESCE(t.amount, 0))
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund')
          THEN -ABS(COALESCE(t.amount, 0))
        ELSE 0
      END
    ), 0)::NUMERIC
    FROM public.transactions t
    WHERE t.case_id = v_case_id
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
  )
  WHERE c.id = v_case_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$fn$;

COMMENT ON FUNCTION public.sync_case_actual_amount() IS 'Trigger: keeps cases.actual_amount in sync with transactions table.';

DROP TRIGGER IF EXISTS trg_sync_case_actual_amount ON public.transactions;
CREATE TRIGGER trg_sync_case_actual_amount
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_case_actual_amount();

-- Initial sync: fix stale actual_amount values (matching what we did via Management API)
UPDATE public.cases c
SET actual_amount = (
  SELECT COALESCE(SUM(
    CASE
      WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears')
        THEN ABS(COALESCE(t.amount, 0))
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund')
        THEN -ABS(COALESCE(t.amount, 0))
      ELSE 0
    END
  ), 0)::NUMERIC
  FROM public.transactions t
  WHERE t.case_id = c.id
    AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
)
WHERE c.id IS NOT NULL;
