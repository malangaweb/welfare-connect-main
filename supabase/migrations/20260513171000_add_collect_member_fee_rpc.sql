-- Atomic fee collection helper for registration/renewal/penalty flows.
-- Inserts the fee transaction and (optionally) reactivates member in one DB transaction.

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
  v_member record;
  v_now timestamptz := now();
BEGIN
  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'member_id is required';
  END IF;

  IF v_fee_type NOT IN ('registration', 'renewal', 'penalty') THEN
    RAISE EXCEPTION 'fee_type must be one of registration/renewal/penalty';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than zero';
  END IF;

  SELECT id, status, is_active
  INTO v_member
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Wallet debit convention in this app ledger.
  v_tx_amount := -abs(v_amount);

  INSERT INTO public.transactions (
    member_id,
    amount,
    transaction_type,
    payment_method,
    status,
    mpesa_reference,
    reference,
    description,
    created_at,
    metadata
  ) VALUES (
    p_member_id,
    v_tx_amount,
    v_fee_type,
    CASE WHEN nullif(trim(coalesce(p_reference, '')), '') IS NULL THEN 'manual' ELSE 'mpesa' END,
    'completed',
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_reference, '')), ''),
    coalesce(nullif(trim(coalesce(p_description, '')), ''), initcap(v_fee_type) || ' fee payment'),
    v_now,
    jsonb_build_object(
      'source', 'api_collect_fee',
      'fee_type', v_fee_type,
      'reference', nullif(trim(coalesce(p_reference, '')), ''),
      'actor', nullif(trim(coalesce(p_actor, '')), '')
    )
  );

  -- Business rule: penalty or registration collection reactivates member.
  IF v_fee_type IN ('penalty', 'registration') THEN
    UPDATE public.members
    SET status = 'active',
        is_active = true,
        updated_at = v_now
    WHERE id = p_member_id;

    IF coalesce(v_member.status, '') <> 'active' OR coalesce(v_member.is_active, false) <> true THEN
      INSERT INTO public.member_status_transitions (
        member_id,
        from_status,
        to_status,
        from_is_active,
        to_is_active,
        reason,
        performed_by_user_id,
        performed_by_role,
        details,
        created_at
      ) VALUES (
        p_member_id,
        v_member.status,
        'active',
        v_member.is_active,
        true,
        'fee_collection_reactivation',
        coalesce(nullif(trim(coalesce(p_actor, '')), ''), 'unknown'),
        'system',
        jsonb_build_object('source', 'collect_member_fee', 'fee_type', v_fee_type),
        v_now
      );
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    action,
    table_name,
    record_id,
    status,
    metadata,
    timestamp
  ) VALUES (
    'FEE_COLLECTION',
    'transactions',
    p_member_id::text,
    'success',
    jsonb_build_object(
      'member_id', p_member_id,
      'fee_type', v_fee_type,
      'amount', v_amount,
      'reference', nullif(trim(coalesce(p_reference, '')), ''),
      'reactivated', (v_fee_type IN ('penalty', 'registration'))
    ),
    v_now
  );

  RETURN json_build_object(
    'success', true,
    'member_id', p_member_id,
    'fee_type', v_fee_type,
    'amount', v_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.collect_member_fee(uuid, text, numeric, text, text, text) TO anon, authenticated, service_role;

