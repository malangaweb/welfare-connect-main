-- The original Part 5 repair ran with `>` in the open-cycle subquery, which
-- missed all members whose scoped-trigger inactivation AND waterfall
-- reactivation fall within the same transaction (same created_at). The `>=`
-- fix was committed to 20260728120000 after it had already run, so this
-- follow-up re-executes the repair logic for everyone still inactive.
--
-- The repair is idempotent:
--   - Already-reversed penalties are excluded by status filter
--   - Already-reactivated members are excluded by status filter
--   - Already-repaired members have the repair transition recorded

DO $$
DECLARE
  m RECORD;
  v_inactivated_at TIMESTAMPTZ;
  v_open_cycle BOOLEAN;
  v_reactivated_at TIMESTAMPTZ;
  v_streak INT;
  v_unpaid_finalized_count INT;
  v_penalty_tx RECORD;
  v_penalty_total NUMERIC;
  v_probation_end DATE;
  v_repair_count INT := 0;
  v_refund_count INT := 0;
  v_tx_refunded INT := 0;
BEGIN
  FOR m IN
    SELECT id, member_number, name
    FROM public.members
    WHERE status = 'inactive'
    ORDER BY member_number
  LOOP
    -- Use >= (not >): the scoped trigger and waterfall share the same
    -- created_at when they fire in one transaction.
    SELECT t.created_at INTO v_inactivated_at
    FROM public.member_status_transitions t
    WHERE t.member_id = m.id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1 FROM public.member_status_transitions later
        WHERE later.member_id = m.id
          AND later.reason = 'auto_wallet_reactivation'
          AND later.created_at >= t.created_at
      )
    ORDER BY t.created_at DESC LIMIT 1;

    v_open_cycle := v_inactivated_at IS NOT NULL;

    SELECT MAX(t.created_at) FILTER (WHERE t.reason = 'auto_wallet_reactivation')
      INTO v_reactivated_at
    FROM public.member_status_transitions t
    WHERE t.member_id = m.id;

    -- Refund penalty charges not yet reversed.
    v_penalty_total := 0;
    FOR v_penalty_tx IN
      SELECT id, amount
      FROM public.transactions
      WHERE member_id = m.id
        AND transaction_type = 'penalty'
        AND COALESCE(LOWER(status), 'completed') IN ('completed', 'success')
        AND COALESCE(metadata->>'source', '') IN ('auto_reinstatement_penalty', 'api_collect_fee')
        AND (v_inactivated_at IS NULL OR created_at >= v_inactivated_at)
    LOOP
      v_penalty_total := v_penalty_total + ABS(v_penalty_tx.amount);
      UPDATE public.transactions
      SET status = 'reversed',
          description = COALESCE(description, '') || ' [REVERSED: reordered to cases-first]',
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'repaired', TRUE,
            'repair_reason', 'penalty_first_to_cases_first',
            'reversed_at', now()
          )
      WHERE id = v_penalty_tx.id;
      v_tx_refunded := v_tx_refunded + 1;
    END LOOP;

    IF v_penalty_total > 0 THEN
      RAISE NOTICE 'REFUND #% (%) reversed_penalty=%', m.member_number, m.name, v_penalty_total;
    END IF;

    -- Reactivate if falsely inactivated (no open cycle, fails corrected criteria).
    IF NOT v_open_cycle THEN
      SELECT COALESCE(ds.current_streak, 0) INTO v_streak
      FROM public.member_default_streaks ds
      WHERE ds.member_id = m.id;

      SELECT COUNT(*)::INT INTO v_unpaid_finalized_count
      FROM (
        SELECT c.id
        FROM public.cases c
        WHERE c.is_finalized = TRUE
          AND public.member_case_obligation_applies(m.id, c.id)
          AND (v_reactivated_at IS NULL OR c.created_at > v_reactivated_at)
          AND COALESCE((
            SELECT SUM(
              CASE
                WHEN t2.transaction_type IN ('contribution','case_wallet_deduction','arrears') THEN ABS(COALESCE(t2.amount,0))
                WHEN t2.transaction_type IN ('contribution_refund','case_wallet_refund') THEN -ABS(COALESCE(t2.amount,0))
                ELSE 0
              END
            )::NUMERIC
            FROM public.transactions t2
            WHERE t2.member_id = m.id AND t2.case_id = c.id
              AND t2.transaction_type IN ('contribution','case_wallet_deduction','arrears','contribution_refund','case_wallet_refund')
              AND COALESCE(LOWER(t2.status),'completed') IN ('completed','success')
          ), 0) < COALESCE(c.contribution_per_member, 0) - 0.009
      ) ob;

      IF COALESCE(v_streak, 0) < 2 AND COALESCE(v_unpaid_finalized_count, 0) < 2 THEN
        v_probation_end := (CURRENT_DATE + INTERVAL '90 days')::DATE;
        PERFORM set_config('app.auto_wallet_reactivation', 'true', true);

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
            'source', 'repair_false_inactivation',
            'streak_at_repair', v_streak,
            'unpaid_finalized_at_repair', v_unpaid_finalized_count,
            'penalty_refunded', v_penalty_total
          ),
          'system'
        );

        INSERT INTO public.member_default_streaks (
          member_id, current_streak, last_case_id, last_defaulted, updated_at
        ) VALUES (m.id, 0, NULL, FALSE, now())
        ON CONFLICT (member_id) DO UPDATE SET
          current_streak = 0, last_defaulted = FALSE, updated_at = now();

        RAISE NOTICE 'REACTIVATE #% (%) streak=% unpaid_finalized=% refund=%',
          m.member_number, m.name, v_streak, v_unpaid_finalized_count, v_penalty_total;
        v_repair_count := v_repair_count + 1;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'REPAIR SUMMARY: % reactivated, % penalty txns refunded across all inactive members',
    v_repair_count, v_tx_refunded;
END;
$$;

-- Part 6: re-run corrected waterfall for members with positive wallet.
DO $$
DECLARE
  m RECORD;
  v_res JSONB;
  v_count INT := 0;
BEGIN
  FOR m IN
    SELECT id, member_number, name
    FROM public.members
    WHERE public.calculate_wallet_balance(id) > 0.009
    ORDER BY member_number
  LOOP
    SELECT public.apply_wallet_payment_waterfall(m.id) INTO v_res;
    IF (v_res->>'penalty_payments')::INT > 0
       OR (v_res->>'finalized_cases_paid')::INT > 0
       OR (v_res->>'active_cases_paid')::INT > 0
    THEN
      v_count := v_count + 1;
      RAISE NOTICE 'WATERFALL #% (%) %', m.member_number, m.name, v_res;
    END IF;
  END LOOP;
  RAISE NOTICE 'WATERFALL RE-APPLIED: % members had deductions', v_count;
END;
$$;
