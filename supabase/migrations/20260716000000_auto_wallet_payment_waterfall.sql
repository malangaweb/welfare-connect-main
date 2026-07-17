-- Wallet top-ups settle member obligations in a strict, all-or-nothing case waterfall:
-- 1. The reinstatement penalty (partial payments permitted).
-- 2. Finalized unpaid cases, oldest first (no partial case payments).
-- 3. Active unpaid cases, oldest first (no partial case payments).
-- A qualifying inactive member moves to probation only after the full penalty is paid.

CREATE OR REPLACE FUNCTION public.block_manual_inactive_reactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'inactive'
     AND NEW.status IN ('active', 'probation')
     AND current_setting('app.auto_wallet_reactivation', TRUE) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Inactive members can only be reactivated by the automatic wallet payment waterfall';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_manual_inactive_reactivation ON public.members;
CREATE TRIGGER trg_block_manual_inactive_reactivation
  BEFORE UPDATE OF status ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.block_manual_inactive_reactivation();

CREATE OR REPLACE FUNCTION public.apply_wallet_payment_waterfall(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_case RECORD;
  v_inactivated_at TIMESTAMPTZ;
  v_penalty_required NUMERIC := 300;
  v_penalty_paid NUMERIC := 0;
  v_penalty_remaining NUMERIC := 0;
  v_wallet NUMERIC := 0;
  v_payment NUMERIC := 0;
  v_case_paid NUMERIC := 0;
  v_case_remaining NUMERIC := 0;
  v_probation_end DATE;
  v_penalty_tx_count INT := 0;
  v_finalized_case_count INT := 0;
  v_active_case_count INT := 0;
  v_finalized_case_blocked BOOLEAN := FALSE;
BEGIN
  SELECT id, status, is_active
  INTO v_member
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_member.status = 'deceased' THEN
    RETURN jsonb_build_object('success', TRUE, 'skipped', 'member_not_payable');
  END IF;

  -- The penalty applies only to a member inactivated by the two-default rule.
  IF v_member.status = 'inactive' THEN
    SELECT created_at
    INTO v_inactivated_at
    FROM public.member_status_transitions
    WHERE member_id = p_member_id
      AND reason = 'auto_inactive_two_consecutive_defaults'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_inactivated_at IS NOT NULL THEN
      SELECT COALESCE(SUM(ABS(amount)), 0)
      INTO v_penalty_paid
      FROM public.transactions
      WHERE member_id = p_member_id
        AND transaction_type = 'penalty'
        AND COALESCE(LOWER(status), 'completed') IN ('completed', 'success')
        AND created_at >= v_inactivated_at
        AND COALESCE(metadata->>'source', '') = 'auto_reinstatement_penalty';

      v_penalty_remaining := GREATEST(v_penalty_required - v_penalty_paid, 0);
      v_wallet := public.calculate_wallet_balance(p_member_id);

      -- Penalties may be settled over multiple top-ups, but cases cannot begin
      -- until this particular reinstatement penalty is settled in full.
      IF v_penalty_remaining > 0 AND v_wallet > 0 THEN
        v_payment := LEAST(v_wallet, v_penalty_remaining);

        INSERT INTO public.transactions (
          member_id, amount, transaction_type, payment_method, status,
          description, reference, metadata
        ) VALUES (
          p_member_id, v_payment, 'penalty', 'wallet', 'completed',
          'Automatic reinstatement penalty payment',
          'auto_reinstatement_penalty:' || p_member_id::TEXT || ':' || EXTRACT(EPOCH FROM now())::BIGINT,
          jsonb_build_object(
            'source', 'auto_reinstatement_penalty',
            'inactivation_at', v_inactivated_at,
            'required_amount', v_penalty_required,
            'partial_payment', v_payment < v_penalty_remaining
          )
        );

        v_penalty_tx_count := v_penalty_tx_count + 1;
        v_penalty_paid := v_penalty_paid + v_payment;
        v_penalty_remaining := GREATEST(v_penalty_required - v_penalty_paid, 0);
      END IF;

      IF v_penalty_remaining > 0 THEN
        RETURN jsonb_build_object(
          'success', TRUE,
          'status', 'inactive',
          'penalty_paid', v_penalty_paid,
          'penalty_remaining', v_penalty_remaining,
          'cases_paid', 0
        );
      END IF;

      v_probation_end := (CURRENT_DATE + INTERVAL '3 months')::DATE;
      PERFORM set_config('app.auto_wallet_reactivation', 'true', true);

      UPDATE public.members
      SET status = 'probation',
          is_active = TRUE,
          probation_end_date = v_probation_end,
          updated_at = now()
      WHERE id = p_member_id;

      INSERT INTO public.member_status_transitions (
        member_id, from_status, to_status, from_is_active, to_is_active,
        reason, details, performed_by_role
      ) VALUES (
        p_member_id, 'inactive', 'probation', v_member.is_active, TRUE,
        'auto_wallet_reactivation',
        jsonb_build_object(
          'inactivation_at', v_inactivated_at,
          'penalty_required', v_penalty_required,
          'penalty_paid', v_penalty_paid,
          'probation_end_date', v_probation_end
        ),
        'system'
      );
    ELSE
      RETURN jsonb_build_object('success', TRUE, 'skipped', 'inactive_not_auto_inactivated');
    END IF;
  END IF;

  -- Finalized cases are the first case priority. A case is paid only if its
  -- entire outstanding amount is available in the wallet.
  FOR v_case IN
    SELECT c.id, c.case_number, COALESCE(c.contribution_per_member, 0) AS required_amount
    FROM public.cases c
    WHERE c.is_finalized = TRUE
      AND public.member_case_obligation_applies(p_member_id, c.id)
    ORDER BY COALESCE(c.end_date, c.start_date, c.created_at::DATE), c.created_at, c.id
  LOOP
    SELECT COALESCE(SUM(
      CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(t.amount)
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(t.amount)
        ELSE 0
      END
    ), 0)
    INTO v_case_paid
    FROM public.transactions t
    WHERE t.member_id = p_member_id
      AND t.case_id = v_case.id
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success');

    v_case_remaining := GREATEST(v_case.required_amount - v_case_paid, 0);
    v_wallet := public.calculate_wallet_balance(p_member_id);

    IF v_case_remaining > 0 THEN
      IF v_wallet < v_case_remaining THEN
        v_finalized_case_blocked := TRUE;
        EXIT;
      END IF;

      INSERT INTO public.transactions (
        member_id, case_id, amount, transaction_type, payment_method, status,
        description, metadata
      ) VALUES (
        p_member_id, v_case.id, v_case_remaining, 'arrears', 'wallet', 'completed',
        'Automatic finalized-case payment for case #' || v_case.case_number,
        jsonb_build_object('source', 'auto_wallet_payment_waterfall', 'priority', 'finalized_case')
      );
      v_finalized_case_count := v_finalized_case_count + 1;
    END IF;
  END LOOP;

  IF v_finalized_case_blocked THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'penalty_payments', v_penalty_tx_count,
      'finalized_cases_paid', v_finalized_case_count,
      'active_cases_paid', 0,
      'wallet_balance', public.calculate_wallet_balance(p_member_id)
    );
  END IF;

  -- Only after all payable finalized cases have been considered, settle active
  -- cases in the same oldest-first, no-partial-payment manner.
  FOR v_case IN
    SELECT c.id, c.case_number, COALESCE(c.contribution_per_member, 0) AS required_amount
    FROM public.cases c
    WHERE c.is_active = TRUE
      AND COALESCE(c.is_finalized, FALSE) = FALSE
      AND public.member_case_obligation_applies(p_member_id, c.id)
    ORDER BY COALESCE(c.start_date, c.created_at::DATE), c.created_at, c.id
  LOOP
    SELECT COALESCE(SUM(
      CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(t.amount)
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(t.amount)
        ELSE 0
      END
    ), 0)
    INTO v_case_paid
    FROM public.transactions t
    WHERE t.member_id = p_member_id
      AND t.case_id = v_case.id
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success');

    v_case_remaining := GREATEST(v_case.required_amount - v_case_paid, 0);
    v_wallet := public.calculate_wallet_balance(p_member_id);

    IF v_case_remaining > 0 THEN
      IF v_wallet < v_case_remaining THEN
        EXIT;
      END IF;

      INSERT INTO public.transactions (
        member_id, case_id, amount, transaction_type, payment_method, status,
        description, metadata
      ) VALUES (
        p_member_id, v_case.id, v_case_remaining, 'case_wallet_deduction', 'wallet', 'completed',
        'Automatic active-case payment for case #' || v_case.case_number,
        jsonb_build_object('source', 'auto_wallet_payment_waterfall', 'priority', 'active_case')
      ) ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_active_case_count := v_active_case_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'penalty_payments', v_penalty_tx_count,
    'finalized_cases_paid', v_finalized_case_count,
    'active_cases_paid', v_active_case_count,
    'wallet_balance', public.calculate_wallet_balance(p_member_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_wallet_payment_waterfall()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_type = 'wallet_funding'
     AND COALESCE(LOWER(NEW.status), 'completed') IN ('completed', 'success')
     AND (
       TG_OP = 'INSERT'
       OR OLD.transaction_type IS DISTINCT FROM 'wallet_funding'
       OR COALESCE(LOWER(OLD.status), 'completed') NOT IN ('completed', 'success')
     ) THEN
    PERFORM public.apply_wallet_payment_waterfall(NEW.member_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_trg_wallet_payment_waterfall ON public.transactions;
CREATE TRIGGER zz_trg_wallet_payment_waterfall
  AFTER INSERT OR UPDATE OF transaction_type, status ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_wallet_payment_waterfall();

-- Late payments settle the obligation, including while a case is being finalized.
CREATE OR REPLACE FUNCTION public.record_case_defaulters_on_finalize()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_finalized IS TRUE AND COALESCE(OLD.is_finalized, FALSE) IS DISTINCT FROM TRUE THEN
    INSERT INTO case_defaulters (case_id, member_id)
    SELECT NEW.id, m.id
    FROM members m
    WHERE m.is_active = TRUE
      AND m.status IN ('active', 'probation')
      AND public.member_case_obligation_applies(m.id, NEW.id)
      AND NOT EXISTS (
        SELECT 1
        FROM transactions t
        WHERE t.member_id = m.id
          AND t.case_id = NEW.id
          AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears')
          AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
      )
    ON CONFLICT (case_id, member_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fee collection remains ledger-only. It no longer changes member status.
CREATE OR REPLACE FUNCTION public.collect_member_fee(
  p_member_id uuid,
  p_fee_type text,
  p_amount numeric,
  p_reference text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_actor text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee_type text := lower(trim(coalesce(p_fee_type, '')));
  v_amount numeric := coalesce(p_amount, 0);
  v_tx_amount numeric;
  v_now timestamptz := now();
BEGIN
  IF p_member_id IS NULL THEN RAISE EXCEPTION 'member_id is required'; END IF;
  IF v_fee_type NOT IN ('registration', 'renewal', 'penalty') THEN
    RAISE EXCEPTION 'fee_type must be one of registration/renewal/penalty';
  END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'amount must be greater than zero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id FOR UPDATE) THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  v_tx_amount := -abs(v_amount);
  INSERT INTO public.transactions (
    member_id, amount, transaction_type, payment_method, status,
    mpesa_reference, reference, description, created_at, metadata
  ) VALUES (
    p_member_id, v_tx_amount, v_fee_type,
    CASE WHEN nullif(trim(coalesce(p_reference, '')), '') IS NULL THEN 'manual' ELSE 'mpesa' END,
    'completed', nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_reference, '')), ''),
    coalesce(nullif(trim(coalesce(p_description, '')), ''), initcap(v_fee_type) || ' fee payment'), v_now,
    jsonb_build_object('source', 'api_collect_fee', 'fee_type', v_fee_type,
      'reference', nullif(trim(coalesce(p_reference, '')), ''), 'actor', nullif(trim(coalesce(p_actor, '')), ''))
  );

  INSERT INTO public.audit_logs (action, table_name, record_id, status, metadata, timestamp)
  VALUES ('FEE_COLLECTION', 'transactions', p_member_id::text, 'success',
    jsonb_build_object('member_id', p_member_id, 'fee_type', v_fee_type, 'amount', v_amount, 'reference', nullif(trim(coalesce(p_reference, '')), ''), 'reactivated', FALSE), v_now);

  RETURN json_build_object('success', true, 'member_id', p_member_id, 'fee_type', v_fee_type, 'amount', v_amount);
END;
$$;

-- Existing positive-wallet inactive members are processed once under the same rules.
DO $$
DECLARE v_member_id UUID;
BEGIN
  FOR v_member_id IN
    SELECT id FROM public.members
    WHERE status = 'inactive' AND public.calculate_wallet_balance(id) > 0
  LOOP
    PERFORM public.apply_wallet_payment_waterfall(v_member_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_wallet_payment_waterfall(UUID) TO service_role;
