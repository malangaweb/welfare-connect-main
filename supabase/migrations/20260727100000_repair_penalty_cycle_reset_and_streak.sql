-- Fix: members who PAID the reinstatement penalty (>=300) sit stuck as
-- 'inactive' while having zero unpaid cases and an already-settled default
-- streak. Two independent gaps cause this trap:
--
--   1. Penalty cycle reset. When the daily discipline sweep re-inactivates a
--      probation member for the SAME defaults the 300 penalty was meant to
--      settle, the wallet is already drained (penalty already taken), so the
--      next reactivation can never re-charge 300 — the old penalty is lost and
--      the member is trapped in inactive with wallet = 0.
--
--   2. Streak never reset on reactivation. Neither
--      apply_wallet_payment_waterfall() (auto) nor execute_member_reinstatement()
--      (manual) clears member_default_streaks.current_streak. So after paying
--      the penalty and flipping to probation, the sweep immediately
--      re-inactivates again purely on the stale streak (>=2). This is exactly
--      what hit members 153 / 203 at 2026-07-27 02:00 — they had NO open cycle
--      at check time, so the open-cycle guard passed and the streak alone fired.
--
-- Proof (live, 2026-07-27):
--   1431 ESTHER BAYA MSANZU   paid 420, streak 3, 0 unpaid, reactivated 07-26
--                             then re-inactivated 07-26 16:36
--   153  EMILY KADZO CHARO    paid 300, streak 3, 0 unpaid, re-inactivated 07-27 02:00
--   203  VINCENT KARISA KAREMA paid 300, streak 2, 0 unpaid, re-inactivated 07-27 02:00
--
-- Fix:
--   (A) Repair: flip the trapped members to probation WITHOUT re-charging the
--       penalty they already paid, reset their streak to 0, and record a
--       sanctioned auto_wallet_reactivation transition. This does NOT touch
--       trg_block_manual_inactive_reactivation (which blocks going inactive).
--   (B) Permanent: reset current_streak to 0 inside BOTH sanctioned
--       reactivation paths so the trap cannot recur.

-- ── Part 1: one-shot repair of members trapped by the penalty-cycle/streak reset ──
DO $$
DECLARE
  m RECORD;
  v_inactivated_at TIMESTAMPTZ;
  v_penalty_paid NUMERIC;
  v_probation_end DATE;
BEGIN
  FOR m IN
    SELECT mb.id, mb.member_number, mb.name
    FROM public.members mb
    WHERE mb.status = 'inactive'
  LOOP
    -- Only act on members in an OPEN reactivation cycle (latest inactivation
    -- has no later reactivation): i.e. they were reactivated, then re-inactivated.
    SELECT t.created_at INTO v_inactivated_at
    FROM public.member_status_transitions t
    WHERE t.member_id = m.id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1 FROM public.member_status_transitions later
        WHERE later.member_id = m.id
          AND later.reason = 'auto_wallet_reactivation'
          AND later.created_at > t.created_at
      )
    ORDER BY t.created_at DESC LIMIT 1;

    CONTINUE WHEN v_inactivated_at IS NULL;

    -- Lifetime penalty already paid (covers the 300 requirement).
    SELECT COALESCE(SUM(ABS(t.amount)), 0)
      INTO v_penalty_paid
    FROM public.transactions t
    WHERE t.member_id = m.id
      AND t.transaction_type = 'penalty'
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success');

    CONTINUE WHEN v_penalty_paid < 300;

    -- Must have NO unpaid finalized cases (otherwise a genuine defaulter).
    CONTINUE WHEN (
      SELECT COALESCE(SUM(1), 0) FROM (
        SELECT DISTINCT c.id
        FROM public.cases c
        WHERE c.is_finalized = TRUE
          AND public.member_case_obligation_applies(m.id, c.id)
          AND COALESCE((
            SELECT SUM(ABS(COALESCE(t2.amount, 0)))
            FROM public.transactions t2
            WHERE t2.member_id = m.id AND t2.case_id = c.id
              AND t2.transaction_type IN ('contribution','case_wallet_deduction','arrears')
              AND LOWER(COALESCE(t2.status,'completed')) IN ('completed','success')
          ), 0) < COALESCE(c.contribution_per_member, 0) - 0.009
      ) ob
    ) > 0;

    -- Settle the cycle: flip to probation (penalty already paid) and clear streak.
    PERFORM set_config('app.auto_wallet_reactivation', 'true', true);
    v_probation_end := (CURRENT_DATE + INTERVAL '90 days')::DATE;

    UPDATE public.members
    SET status = 'probation',
        is_active = TRUE,
        probation_end_date = v_probation_end,
        updated_at = now()
    WHERE id = m.id;

    INSERT INTO public.member_status_transitions (
      member_id, from_status, to_status, from_is_active, to_is_active,
      reason, details, performed_by_role
    ) VALUES (
      m.id, 'inactive', 'probation', FALSE, TRUE,
      'auto_wallet_reactivation',
      jsonb_build_object(
        'inactivation_at', v_inactivated_at,
        'penalty_required', 300,
        'penalty_paid', v_penalty_paid,
        'source', 'repair_penalty_cycle_reset',
        'streak_reset', TRUE
      ),
      'system'
    );

    -- Reset the stale default streak so the daily sweep cannot re-inactivate
    -- purely on the history the penalty was meant to settle.
    INSERT INTO public.member_default_streaks (
      member_id, current_streak, last_case_id, last_defaulted, updated_at
    ) VALUES (m.id, 0, NULL, FALSE, now())
    ON CONFLICT (member_id) DO UPDATE SET
      current_streak = 0,
      last_defaulted = FALSE,
      updated_at = now();

    RAISE NOTICE 'Repair reactivated member #% (%) penalty=% streak reset',
      m.member_number, m.name, v_penalty_paid;
  END LOOP;
END;
$$;

-- ── Part 2: permanent fix — reset streak inside the auto wallet waterfall ──
-- (only the STAGE 0 reactivation branch needs the reset; the legacy STAGE 2
--  branch is unreachable when penalty is charged first, but we reset there too
--  for safety.)
CREATE OR REPLACE FUNCTION public.apply_wallet_payment_waterfall(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_now TIMESTAMPTZ := clock_timestamp();
  v_probation_end DATE;
  v_inactivated_at TIMESTAMPTZ;
  v_open_cycle BOOLEAN := FALSE;
  v_guard_was_set BOOLEAN := FALSE;
BEGIN
  v_guard_was_set := COALESCE(current_setting('app.auto_wallet_reactivation', TRUE), 'false') = 'true';
  PERFORM set_config('app.auto_wallet_reactivation', 'true', true);

  SELECT id, status, is_active
  INTO v_member
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_member.status = 'deceased' THEN
    PERFORM set_config('app.auto_wallet_reactivation', v_guard_was_set::TEXT, true);
    RETURN jsonb_build_object('success', TRUE, 'skipped', 'member_not_payable');
  END IF;

  IF v_member.status = 'inactive' THEN
    SELECT t.created_at INTO v_inactivated_at
    FROM public.member_status_transitions t
    WHERE t.member_id = p_member_id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1 FROM public.member_status_transitions later
        WHERE later.member_id = p_member_id
          AND later.reason = 'auto_wallet_reactivation'
          AND later.created_at > t.created_at
      )
    ORDER BY t.created_at DESC LIMIT 1;

    v_open_cycle := v_inactivated_at IS NOT NULL;
  END IF;

  -- Compute how much penalty is still owed (for an open reactivation cycle).
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
  END IF;

  -- STAGE 0 (penalty-first, only for inactive + open cycle):
  -- Charge the reinstatement penalty BEFORE case payments so funding events
  -- accumulate toward the 300 threshold instead of being consumed by cases.
  IF v_member.status = 'inactive' AND v_open_cycle AND v_penalty_remaining > 0 THEN
    v_wallet := public.calculate_wallet_balance(p_member_id);
    IF v_wallet > 0 THEN
      PERFORM set_config('app.auto_wallet_reactivation', 'true', true);
      v_payment := LEAST(v_wallet, v_penalty_remaining);
      INSERT INTO public.transactions (
        member_id, amount, transaction_type, payment_method, status,
        created_at, description, reference, metadata
      ) VALUES (
        p_member_id, v_payment, 'penalty', 'wallet', 'completed',
        clock_timestamp(),
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

      IF v_penalty_remaining <= 0 THEN
        v_probation_end := (CURRENT_DATE + INTERVAL '90 days')::DATE;
        PERFORM set_config('app.auto_wallet_reactivation', 'true', true);
        UPDATE public.members
        SET status = 'probation', is_active = TRUE, probation_end_date = v_probation_end, updated_at = now()
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
        -- Reset the default streak: paying the penalty settles the prior defaults
        -- (matches what the discipline sweep expects after reinstatement).
        INSERT INTO public.member_default_streaks (
          member_id, current_streak, last_case_id, last_defaulted, updated_at
        ) VALUES (p_member_id, 0, NULL, FALSE, now())
        ON CONFLICT (member_id) DO UPDATE SET
          current_streak = 0, last_defaulted = FALSE, updated_at = now();
        v_target_member_id := p_member_id;
      END IF;
    END IF;
  END IF;

  -- STAGE 1: pay oldest unpaid cases (finalized + active), oldest first.
  FOR v_case IN
    SELECT c.id, c.case_number, c.is_finalized,
           COALESCE(c.contribution_per_member, 0) AS required_amount,
           COALESCE(c.end_date, c.start_date, c.created_at::DATE) AS case_date
    FROM public.cases c
    WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
      AND public.member_case_obligation_applies(p_member_id, c.id)
    ORDER BY
      CASE WHEN c.is_finalized THEN 0 ELSE 1 END,
      COALESCE(c.end_date, c.start_date, c.created_at::DATE),
      c.created_at, c.id
  LOOP
    IF v_member.status = 'inactive' AND v_open_cycle AND v_penalty_remaining > 0 THEN
      CONTINUE;
    END IF;

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
    IF v_case_remaining <= 0 THEN CONTINUE; END IF;

    v_wallet := public.calculate_wallet_balance(p_member_id);
    IF v_wallet < v_case_remaining THEN EXIT; END IF;

    IF COALESCE(v_case.is_finalized, FALSE) THEN
      INSERT INTO public.transactions (
        member_id, case_id, amount, transaction_type, payment_method, status,
        created_at, description, metadata
      ) VALUES (
        p_member_id, v_case.id, v_case_remaining, 'arrears', 'wallet', 'completed',
        clock_timestamp(),
        'Automatic finalized-case payment for case #' || v_case.case_number,
        jsonb_build_object('source', 'auto_wallet_payment_waterfall', 'priority', 'finalized_case')
      );
      v_finalized_paid := v_finalized_paid + 1;
    ELSE
      INSERT INTO public.transactions (
        member_id, case_id, amount, transaction_type, payment_method, status,
        created_at, description, metadata
      ) VALUES (
        p_member_id, v_case.id, v_case_remaining, 'case_wallet_deduction', 'wallet', 'completed',
        clock_timestamp(),
        'Automatic active-case payment for case #' || v_case.case_number,
        jsonb_build_object('source', 'auto_wallet_payment_waterfall', 'priority', 'active_case')
      );
      v_active_paid := v_active_paid + 1;
    END IF;
  END LOOP;

  -- STAGE 2 (legacy): if penalty was NOT charged first.
  IF v_member.status = 'inactive' AND v_open_cycle THEN
    v_penalty_remaining := GREATEST(v_penalty_required - v_penalty_paid, 0);
    v_wallet := public.calculate_wallet_balance(p_member_id);

    IF v_penalty_remaining > 0 AND v_wallet > 0 AND v_target_member_id IS NULL THEN
      PERFORM set_config('app.auto_wallet_reactivation', 'true', true);
      v_payment := LEAST(v_wallet, v_penalty_remaining);
      INSERT INTO public.transactions (
        member_id, amount, transaction_type, payment_method, status,
        created_at, description, reference, metadata
      ) VALUES (
        p_member_id, v_payment, 'penalty', 'wallet', 'completed',
        clock_timestamp(),
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

    IF v_penalty_remaining <= 0 AND v_target_member_id IS NULL THEN
      v_probation_end := (CURRENT_DATE + INTERVAL '90 days')::DATE;
      PERFORM set_config('app.auto_wallet_reactivation', 'true', true);
      UPDATE public.members
      SET status = 'probation', is_active = TRUE, probation_end_date = v_probation_end, updated_at = now()
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
      INSERT INTO public.member_default_streaks (
        member_id, current_streak, last_case_id, last_defaulted, updated_at
      ) VALUES (p_member_id, 0, NULL, FALSE, now())
      ON CONFLICT (member_id) DO UPDATE SET
        current_streak = 0, last_defaulted = FALSE, updated_at = now();
      v_target_member_id := p_member_id;
    END IF;
  END IF;

  PERFORM set_config('app.auto_wallet_reactivation', v_guard_was_set::TEXT, true);

  RETURN jsonb_build_object(
    'success', TRUE,
    'penalty_payments', v_penalty_tx_count,
    'finalized_cases_paid', v_finalized_paid,
    'active_cases_paid', v_active_paid,
    'flipped_to', CASE WHEN v_target_member_id IS NOT NULL THEN 'probation' ELSE NULL END,
    'wallet_balance', public.calculate_wallet_balance(p_member_id)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_wallet_payment_waterfall(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_wallet_payment_waterfall(uuid) IS
'Pays case obligations and the reinstatement penalty from the wallet. For inactive members with an open reactivation cycle the penalty is charged FIRST; on reactivation the default streak is reset to 0 so the discipline sweep cannot re-inactivate for the already-settled defaults.';

-- ── Part 3: permanent fix — reset streak inside manual reinstatement ──
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

  -- Reset the default streak: paying the 300 penalty settles the prior
  -- consecutive defaults, so the daily discipline sweep must not re-inactivate
  -- the member on the stale streak.
  INSERT INTO member_default_streaks (
    member_id, current_streak, last_case_id, last_defaulted, updated_at
  ) VALUES (p_member_id, 0, NULL, FALSE, now())
  ON CONFLICT (member_id) DO UPDATE SET
    current_streak = 0, last_defaulted = FALSE, updated_at = now();

  RETURN jsonb_build_object(
    'success', TRUE,
    'member_id', p_member_id,
    'new_status', 'probation',
    'probation_end_date', v_probation_end,
    'penalty_transaction_id', v_penalty_tx_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION execute_member_reinstatement(UUID, TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION execute_member_reinstatement(UUID, TEXT, TEXT) IS
'Admin/manual reinstatement: validates eligibility, charges the 300 penalty, flips inactive->probation, and resets the default streak to 0 so the member is not immediately re-inactivated by the discipline sweep.';
