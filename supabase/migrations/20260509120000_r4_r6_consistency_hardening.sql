-- R4/R5/R6 hardening: status consistency + strict reinstatement execution checks

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'members_status_allowed_values_chk'
      AND conrelid = 'members'::regclass
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_status_allowed_values_chk
      CHECK (status IN ('active', 'inactive', 'probation', 'deceased'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION execute_member_reinstatement(
  p_member_id UUID,
  p_actor_user_id TEXT,
  p_actor_role TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_check RECORD;
  v_penalty_tx_id UUID;
  v_probation_end DATE;
  v_old_status TEXT;
  v_old_is_active BOOLEAN;
  v_wallet_balance NUMERIC := 0;
  v_unpaid_count INT := 0;
BEGIN
  SELECT * INTO v_check
  FROM get_member_reinstatement_precheck(p_member_id)
  LIMIT 1;

  IF COALESCE(v_check.eligible, FALSE) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Reinstatement pre-check failed',
      'blockers', COALESCE(v_check.blockers, '[]'::jsonb),
      'unpaid_case_count', COALESCE(v_check.unpaid_case_count, 0),
      'unpaid_total', COALESCE(v_check.unpaid_total, 0)
    );
  END IF;

  SELECT status, is_active, COALESCE(wallet_balance, 0)
  INTO v_old_status, v_old_is_active, v_wallet_balance
  FROM members
  WHERE id = p_member_id
  FOR UPDATE;

  IF v_old_status IS DISTINCT FROM 'inactive' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Member is no longer inactive',
      'blockers', jsonb_build_array('member_must_be_inactive')
    );
  END IF;

  IF v_wallet_balance < 300 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Insufficient wallet for penalty',
      'blockers', jsonb_build_array('insufficient_wallet_for_penalty')
    );
  END IF;

  SELECT COUNT(*) INTO v_unpaid_count
  FROM get_member_unpaid_case_obligations(p_member_id);

  IF v_unpaid_count > 0 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Member still has unpaid case obligations',
      'blockers', jsonb_build_array('unpaid_case_obligations'),
      'unpaid_case_count', v_unpaid_count
    );
  END IF;

  INSERT INTO transactions (
    member_id,
    case_id,
    amount,
    transaction_type,
    payment_method,
    status,
    description,
    reference,
    metadata
  ) VALUES (
    p_member_id,
    NULL,
    300,
    'penalty',
    'wallet',
    'completed',
    'Reinstatement penalty',
    'reinstatement_penalty:' || p_member_id::TEXT || ':' || EXTRACT(EPOCH FROM now())::BIGINT,
    jsonb_build_object(
      'source', 'reinstatement_penalty',
      'performed_by_user_id', p_actor_user_id,
      'performed_by_role', p_actor_role
    )
  ) RETURNING id INTO v_penalty_tx_id;

  v_probation_end := (CURRENT_DATE + INTERVAL '3 months')::DATE;

  UPDATE members
  SET status = 'probation',
      is_active = TRUE,
      probation_end_date = v_probation_end,
      updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO member_status_transitions (
    member_id,
    from_status,
    to_status,
    from_is_active,
    to_is_active,
    reason,
    details,
    performed_by_user_id,
    performed_by_role
  ) VALUES (
    p_member_id,
    v_old_status,
    'probation',
    v_old_is_active,
    TRUE,
    'reinstatement_probation',
    jsonb_build_object(
      'penalty_transaction_id', v_penalty_tx_id,
      'probation_end_date', v_probation_end,
      'penalty_amount', 300
    ),
    p_actor_user_id,
    p_actor_role
  );

  INSERT INTO member_reinstatement_events (
    member_id,
    penalty_transaction_id,
    unpaid_case_count_at_check,
    unpaid_total_at_check,
    probation_end_date,
    performed_by_user_id,
    performed_by_role
  ) VALUES (
    p_member_id,
    v_penalty_tx_id,
    COALESCE(v_check.unpaid_case_count, 0),
    COALESCE(v_check.unpaid_total, 0),
    v_probation_end,
    p_actor_user_id,
    p_actor_role
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'member_id', p_member_id,
    'new_status', 'probation',
    'probation_end_date', v_probation_end,
    'penalty_transaction_id', v_penalty_tx_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
