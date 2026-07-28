-- Part 5 of the earlier repair reactivated falsely inactive members to
-- probation BEFORE Part 6 re-ran the waterfall.  Because the waterfall's
-- Stage 2 (reinstatement penalty) only fires for inactive members with
-- open cycles, the penalty was never charged from wallet.  Members 569
-- and 120 ended up with 60 KES in wallet that should have gone to
-- reinstatement penalty under correct cases-first ordering.
--
-- This migration charges the correct penalty amount from wallet for all
-- members who were reactivated by the repair, then re-evaluates whether
-- they should remain on probation.

DO $$
DECLARE
  m RECORD;
  v_inactivated_at TIMESTAMPTZ;
  v_penalty_paid NUMERIC;
  v_penalty_remaining NUMERIC;
  v_wallet NUMERIC;
  v_charge NUMERIC;
  v_streak INT;
  v_unpaid_finalized INT;
  v_reactivated_at TIMESTAMPTZ;
  v_adjusted_count INT := 0;
  v_reinactivated_count INT := 0;
BEGIN
  FOR m IN
    SELECT DISTINCT t.member_id, mb.member_number, mb.name, mb.status, mb.is_active
    FROM public.member_status_transitions t
    JOIN public.members mb ON mb.id = t.member_id
    WHERE t.reason = 'auto_wallet_reactivation'
      AND t.details->>'source' = 'repair_false_inactivation'
      AND mb.status IN ('probation', 'active')
  LOOP
    -- Find the latest inactivation anchor that is still open.
    -- Exclude the repair's own reactivation from closing the cycle, otherwise
    -- all prior inactivations appear closed and the penalty anchor is lost.
    SELECT t2.created_at INTO v_inactivated_at
    FROM public.member_status_transitions t2
    WHERE t2.member_id = m.member_id
      AND t2.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1 FROM public.member_status_transitions later
        WHERE later.member_id = m.member_id
          AND later.reason = 'auto_wallet_reactivation'
          AND later.created_at > t2.created_at
          AND COALESCE(later.details->>'source', '') != 'repair_false_inactivation'
      )
    ORDER BY t2.created_at DESC LIMIT 1;

    -- If there's no open inactivation anchor, the member was not in an
    -- automated penalty cycle — skip (e.g. member was manually inactive).
    IF v_inactivated_at IS NULL THEN
      CONTINUE;
    END IF;

    -- Penalty paid since that anchor (reversed transactions are excluded
    -- because their status is no longer 'completed' or 'success').
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_penalty_paid
    FROM public.transactions
    WHERE member_id = m.member_id
      AND transaction_type = 'penalty'
      AND COALESCE(LOWER(status), 'completed') IN ('completed', 'success')
      AND COALESCE(metadata->>'source', '') IN ('auto_reinstatement_penalty', 'api_collect_fee')
      AND created_at >= v_inactivated_at;

    v_penalty_remaining := GREATEST(300 - v_penalty_paid, 0);

    -- No penalty due → no adjustment needed.
    IF v_penalty_remaining <= 0 THEN
      CONTINUE;
    END IF;

    v_wallet := public.calculate_wallet_balance(m.member_id);
    v_charge := LEAST(v_wallet, v_penalty_remaining);

    IF v_charge <= 0 THEN
      CONTINUE;
    END IF;

    -- Charge the correct penalty amount from wallet.
    INSERT INTO public.transactions (
      member_id, amount, transaction_type, payment_method, status,
      created_at, description, reference, metadata
    ) VALUES (
      m.member_id, v_charge, 'penalty', 'wallet', 'completed',
      clock_timestamp(),
      'Corrective reinstatement penalty (repair shortfall)',
      'repair_penalty_shortfall:' || m.member_id::TEXT || ':' || EXTRACT(EPOCH FROM clock_timestamp())::BIGINT,
      jsonb_build_object(
        'source', 'auto_reinstatement_penalty',
        'repair_shortfall_fix', TRUE,
        'inactivation_at', v_inactivated_at,
        'penalty_remaining_before', v_penalty_remaining,
        'penalty_paid_before', v_penalty_paid
      )
    );

    v_adjusted_count := v_adjusted_count + 1;

    RAISE NOTICE 'ADJUST #% (%) charged=% penalty_paid=% pen_rem=% wallet_before=%',
      m.member_number, m.name, v_charge,
      v_penalty_paid + v_charge,
      GREATEST(300 - (v_penalty_paid + v_charge), 0),
      v_wallet;

    -- If the member has not yet paid the full 300 penalty, check whether
    -- they still qualify for inactivation under the corrected criteria.
    -- If they do, re-inactivate them.
    v_penalty_paid := v_penalty_paid + v_charge;
    v_penalty_remaining := GREATEST(300 - v_penalty_paid, 0);

    IF v_penalty_remaining > 0 THEN
      SELECT COALESCE(ds.current_streak, 0) INTO v_streak
      FROM public.member_default_streaks ds
      WHERE ds.member_id = m.member_id;

      -- The latest legitimate auto-reactivation before the repair.
      SELECT MAX(t3.created_at) FILTER (
        WHERE t3.reason = 'auto_wallet_reactivation'
          AND COALESCE(t3.details->>'source', '') != 'repair_false_inactivation'
      ) INTO v_reactivated_at
      FROM public.member_status_transitions t3
      WHERE t3.member_id = m.member_id;

      SELECT COUNT(*)::INT INTO v_unpaid_finalized
      FROM (
        SELECT c.id
        FROM public.cases c
        WHERE c.is_finalized = TRUE
          AND public.member_case_obligation_applies(m.member_id, c.id)
          AND (v_reactivated_at IS NULL OR c.created_at > v_reactivated_at)
          AND COALESCE((
            SELECT SUM(CASE
              WHEN t4.transaction_type IN ('contribution','case_wallet_deduction','arrears') THEN ABS(COALESCE(t4.amount,0))
              WHEN t4.transaction_type IN ('contribution_refund','case_wallet_refund') THEN -ABS(COALESCE(t4.amount,0))
              ELSE 0
            END)::NUMERIC
            FROM public.transactions t4
            WHERE t4.member_id = m.member_id AND t4.case_id = c.id
              AND t4.transaction_type IN ('contribution','case_wallet_deduction','arrears','contribution_refund','case_wallet_refund')
              AND COALESCE(LOWER(t4.status),'completed') IN ('completed','success')
          ), 0) < COALESCE(c.contribution_per_member, 0) - 0.009
      ) ob;

      IF COALESCE(v_streak, 0) >= 2 OR COALESCE(v_unpaid_finalized, 0) >= 2 THEN
        UPDATE public.members
        SET status = 'inactive', is_active = FALSE, updated_at = now()
        WHERE id = m.member_id;

        INSERT INTO public.member_status_transitions (
          member_id, from_status, to_status, from_is_active, to_is_active,
          reason, details, performed_by_role
        ) VALUES (
          m.member_id, m.status, 'inactive', m.is_active, FALSE,
          'auto_inactive_two_consecutive_defaults',
          jsonb_build_object(
            'source', 'repair_reinactivation',
            'streak', v_streak,
            'unpaid_finalized_count', v_unpaid_finalized,
            'penalty_remaining', v_penalty_remaining
          ),
          'system'
        );

        v_reinactivated_count := v_reinactivated_count + 1;
        RAISE NOTICE 'RE-INACTIVATE #% (%) streak=% unpaid_finalized=% pen_rem=%',
          m.member_number, m.name, v_streak, v_unpaid_finalized, v_penalty_remaining;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'SHORTFALL FIX SUMMARY: % penalty adjustments, % re-inactivations',
    v_adjusted_count, v_reinactivated_count;
END;
$$;
