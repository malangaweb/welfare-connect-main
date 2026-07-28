-- Under correct cases-first ordering, member 569 would have paid 60 toward
-- the 300 reinstatement penalty and remained inactive (only 60/300 paid).
-- The repair incorrectly reactivated them to probation based on discipline
-- criteria (streak=0, unpaid_finalized=0), but those determine INactivation,
-- not reinstatement.  A member can be falsely inactivated yet still need
-- to pay their way back through the penalty mechanism.
--
-- This migration re-inactivates any repair-reactivated member who hasn't
-- paid the full 300 reinstatement penalty.  The corrected waterfall will
-- charge more penalty on future fundings and eventually reactivate them
-- when 300 is reached.
DO $$
DECLARE
  m RECORD;
  v_inactivated_at TIMESTAMPTZ;
  v_penalty_paid NUMERIC;
  v_penalty_remaining NUMERIC;
  v_reinactivated_count INT := 0;
BEGIN
  FOR m IN
    SELECT DISTINCT t.member_id, mb.member_number, mb.name, mb.status
    FROM public.member_status_transitions t
    JOIN public.members mb ON mb.id = t.member_id
    WHERE t.reason = 'auto_wallet_reactivation'
      AND t.details->>'source' = 'repair_false_inactivation'
      AND mb.status IN ('probation', 'active')
  LOOP
    -- Find the latest open inactivation anchor (excluding repair reactivation).
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

    IF v_inactivated_at IS NULL THEN
      CONTINUE;
    END IF;

    -- Penalty paid since that anchor (excluding reversed).
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_penalty_paid
    FROM public.transactions
    WHERE member_id = m.member_id
      AND transaction_type = 'penalty'
      AND COALESCE(LOWER(status), 'completed') IN ('completed', 'success')
      AND COALESCE(metadata->>'source', '') IN ('auto_reinstatement_penalty', 'api_collect_fee')
      AND created_at >= v_inactivated_at;

    v_penalty_remaining := GREATEST(300 - v_penalty_paid, 0);

    -- If they haven't paid the full penalty, they should still be inactive.
    IF v_penalty_remaining > 0 THEN
      UPDATE public.members
      SET status = 'inactive', is_active = FALSE, updated_at = now()
      WHERE id = m.member_id;

      INSERT INTO public.member_status_transitions (
        member_id, from_status, to_status, from_is_active, to_is_active,
        reason, details, performed_by_role
      ) VALUES (
        m.member_id, m.status, 'inactive', TRUE, FALSE,
        'auto_inactive_two_consecutive_defaults',
        jsonb_build_object(
          'source', 'repair_reinactivation_penalty_shortfall',
          'penalty_paid', v_penalty_paid,
          'penalty_remaining', v_penalty_remaining,
          'inactivation_at', v_inactivated_at
        ),
        'system'
      );

      v_reinactivated_count := v_reinactivated_count + 1;
      RAISE NOTICE 'RE-INACTIVATE #% (%) status=%->inactive penalty_paid=% remaining=%',
        m.member_number, m.name, m.status, v_penalty_paid, v_penalty_remaining;
    END IF;
  END LOOP;

  RAISE NOTICE 'RE-INACTIVATION SUMMARY: % members set back to inactive (insufficient penalty)',
    v_reinactivated_count;
END;
$$;
