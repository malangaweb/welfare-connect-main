-- Change probation length from 3 calendar months (~92 days) to exactly 90 days.
-- Affects two functions: apply_wallet_payment_waterfall (auto) and
-- execute_member_reinstatement (manual admin reinstatement).

-- ── Part 1: apply_wallet_payment_waterfall ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_wallet_payment_waterfall(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_case RECORD;
  v_case_required NUMERIC := 0;
  v_case_paid NUMERIC := 0;
  v_case_remaining NUMERIC := 0;
  v_finalized_paid INT := 0;
  v_active_paid INT := 0;
  v_penalty_required NUMERIC := 300;
  v_penalty_paid NUMERIC := 0;
  v_penalty_remaining NUMERIC := 0;
  v_payment NUMERIC := 0;
  v_wallet NUMERIC := 0;
  v_payout_inserted BOOLEAN := FALSE;
  v_penalty_tx_count INT := 0;
  v_target_member_id UUID;
  v_now TIMESTAMPTZ := now();
  v_probation_end DATE;
  v_inactivated_at TIMESTAMPTZ;
  v_open_cycle BOOLEAN := FALSE;
BEGIN
  SELECT id, status, is_active
  INTO v_member
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_member.status = 'deceased' THEN
    RETURN jsonb_build_object('success', TRUE, 'skipped', 'member_not_payable');
  END IF;

  -- Detect prior open cycle for inactive members.
  IF v_member.status = 'inactive' THEN
    SELECT t.created_at INTO v_inactivated_at
    FROM public.member_status_transitions t
    WHERE t.member_id = p_member_id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1
        FROM public.member_status_transitions later
        WHERE later.member_id = p_member_id
          AND later.reason = 'auto_wallet_reactivation'
          AND later.created_at > t.created_at
      )
    ORDER BY t.created_at DESC
    LIMIT 1;

    v_open_cycle := v_inactivated_at IS NOT NULL;
  END IF;

  -- ── Stage 1: pay oldest unpaid cases (finalized + active), oldest first.
  FOR v_case IN
    SELECT
      c.id,
      c.case_number,
      c.is_finalized,
      COALESCE(c.contribution_per_member, 0) AS required_amount,
      COALESCE(c.end_date, c.start_date, c.created_at::DATE) AS case_date
    FROM public.cases c
    WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
      AND public.member_case_obligation_applies(p_member_id, c.id)
    ORDER BY
      CASE WHEN c.is_finalized THEN 0 ELSE 1 END,
      COALESCE(c.end_date, c.start_date, c.created_at::DATE),
      c.created_at,
      c.id
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
    IF v_case_remaining <= 0 THEN
      CONTINUE;
    END IF;

    v_wallet := public.calculate_wallet_balance(p_member_id);
    IF v_wallet < v_case_remaining THEN
      EXIT;
    END IF;

    IF COALESCE(v_case.is_finalized, FALSE) THEN
      INSERT INTO public.transactions (
        member_id, case_id, amount, transaction_type, payment_method, status,
        description, metadata
      ) VALUES (
        p_member_id, v_case.id, v_case_remaining, 'arrears', 'wallet', 'completed',
        'Automatic finalized-case payment for case #' || v_case.case_number,
        jsonb_build_object('source', 'auto_wallet_payment_waterfall', 'priority', 'finalized_case')
      );
      v_finalized_paid := v_finalized_paid + 1;
    ELSE
      INSERT INTO public.transactions (
        member_id, case_id, amount, transaction_type, payment_method, status,
        description, metadata
      ) VALUES (
        p_member_id, v_case.id, v_case_remaining, 'case_wallet_deduction', 'wallet', 'completed',
        'Automatic active-case payment for case #' || v_case.case_number,
        jsonb_build_object('source', 'auto_wallet_payment_waterfall', 'priority', 'active_case')
      );
      v_active_paid := v_active_paid + 1;
    END IF;
  END LOOP;

  -- ── Stage 2: pay reinstatement penalty (inactive members with open cycle)
  IF v_member.status = 'inactive' AND v_open_cycle THEN
    SELECT COALESCE(SUM(ABS(t.amount)), 0)
    INTO v_penalty_paid
    FROM public.transactions t
    WHERE t.member_id = p_member_id
      AND t.transaction_type = 'penalty'
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
      AND COALESCE(t.metadata->>'source', '') IN ('auto_reinstatement_penalty', 'api_collect_fee')
      AND t.created_at >= v_inactivated_at;

    v_penalty_remaining := GREATEST(v_penalty_required - v_penalty_paid, 0);
    v_wallet := public.calculate_wallet_balance(p_member_id);

    IF v_penalty_remaining > 0 AND v_wallet > 0 THEN
      PERFORM set_config('app.auto_wallet_reactivation', 'true', true);

      v_payment := LEAST(v_wallet, v_penalty_remaining);
      INSERT INTO public.transactions (
        member_id, amount, transaction_type, payment_method, status,
        description, reference, metadata
      ) VALUES (
        p_member_id, v_payment, 'penalty', 'wallet', 'completed',
        'Automatic reinstatement penalty payment',
        'auto_reinstatement_penalty:' || p_member_id::TEXT || ':' || EXTRACT(EPOCH FROM v_now)::BIGINT,
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

    -- Flip to probation once full penalty is paid.
    IF v_penalty_remaining <= 0 THEN
      v_probation_end := (CURRENT_DATE + INTERVAL '90 days')::DATE;

      PERFORM set_config('app.auto_wallet_reactivation', 'true', true);

      UPDATE public.members
      SET status = 'probation',
          is_active = TRUE,
          probation_end_date = v_probation_end,
          updated_at = v_now
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

      v_target_member_id := p_member_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'penalty_payments', v_penalty_tx_count,
    'finalized_cases_paid', v_finalized_paid,
    'active_cases_paid', v_active_paid,
    'flipped_to', CASE WHEN v_target_member_id IS NOT NULL THEN 'probation' ELSE NULL END,
    'wallet_balance', public.calculate_wallet_balance(p_member_id)
  );
END;
$$;

-- ── Part 2: execute_member_reinstatement ────────────────────────────────────

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
    member_id, case_id, amount, transaction_type, payment_method,
    status, description, reference, metadata
  ) VALUES (
    p_member_id, NULL, 300, 'penalty', 'wallet',
    'completed', 'Reinstatement penalty',
    'reinstatement_penalty:' || p_member_id::TEXT || ':' || EXTRACT(EPOCH FROM now())::BIGINT,
    jsonb_build_object(
      'source', 'reinstatement_penalty',
      'performed_by_user_id', p_actor_user_id,
      'performed_by_role', p_actor_role
    )
  ) RETURNING id INTO v_penalty_tx_id;

  v_probation_end := (CURRENT_DATE + INTERVAL '90 days')::DATE;

  UPDATE members
  SET status = 'probation',
      is_active = TRUE,
      probation_end_date = v_probation_end,
      updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO member_status_transitions (
    member_id, from_status, to_status, from_is_active, to_is_active,
    reason, details, performed_by_user_id, performed_by_role
  ) VALUES (
    p_member_id, v_old_status, 'probation', v_old_is_active, TRUE,
    'reinstatement_probation',
    jsonb_build_object(
      'penalty_transaction_id', v_penalty_tx_id,
      'probation_end_date', v_probation_end,
      'penalty_amount', 300
    ),
    p_actor_user_id, p_actor_role
  );

  INSERT INTO member_reinstatement_events (
    member_id, penalty_transaction_id,
    unpaid_case_count_at_check, unpaid_total_at_check,
    probation_end_date, performed_by_user_id, performed_by_role
  ) VALUES (
    p_member_id, v_penalty_tx_id,
    COALESCE(v_check.unpaid_case_count, 0),
    COALESCE(v_check.unpaid_total, 0),
    v_probation_end, p_actor_user_id, p_actor_role
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
