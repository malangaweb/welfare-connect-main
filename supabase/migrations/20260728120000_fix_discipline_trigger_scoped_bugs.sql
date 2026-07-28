-- Fix: check_member_discipline (trigger-called scoped version) has two bugs
-- that cause the ping-pong re-inactivation:
--
--   1. No reactivation scoping: it counts ALL unpaid cases via
--      get_member_total_due(), including pre-penalty cases that the 300 KES
--      reinstatement penalty was meant to settle. The full sweep
--      check_and_apply_member_discipline was already fixed in
--      20260726020000 to filter c.created_at > v_reactivated_at, but the
--      scoped trigger version was never updated.
--
--   2. Counts active cases toward re-inactivation: get_member_total_due()
--      includes unpaid ACTIVE cases. The full sweep only counts FINALIZED
--      cases. A member paying down active obligations via the waterfall
--      should not be re-inactivated for the cases they are actively paying.
--
-- The fix rewrites check_member_discipline to use the exact same counting
-- logic as check_and_apply_member_discipline (finalized only, post-reactivation
-- scoping), eliminating the discrepancy.

CREATE OR REPLACE FUNCTION public.check_member_discipline(p_member_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_streak INT := 0;
  v_reactivated_at TIMESTAMPTZ;
  v_open_cycle BOOLEAN := FALSE;
  v_unpaid_finalized_count INT := 0;
BEGIN
  SELECT status INTO v_status
  FROM public.members
  WHERE id = p_member_id
    AND status IN ('probation', 'active')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Latest auto_wallet_reactivation (if any).
  SELECT MAX(t.created_at) FILTER (WHERE t.reason = 'auto_wallet_reactivation')
    INTO v_reactivated_at
  FROM public.member_status_transitions t
  WHERE t.member_id = p_member_id;

  -- Open cycle: the latest auto_inactive has no later auto_wallet_reactivation.
  -- For active/probation members this can happen only when the member was
  -- manually reinstated (reason = 'reinstatement_probation'). In that case the
  -- manual reinstatement is authoritative — skip.
  SELECT EXISTS(
    SELECT 1
    FROM public.member_status_transitions t
    WHERE t.member_id = p_member_id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1 FROM public.member_status_transitions later
        WHERE later.member_id = p_member_id
          AND later.reason = 'auto_wallet_reactivation'
          AND later.created_at > t.created_at
      )
  ) INTO v_open_cycle;

  IF v_open_cycle THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(ds.current_streak, 0) INTO v_streak
  FROM public.member_default_streaks ds
  WHERE ds.member_id = p_member_id;

  -- Count unpaid FINALIZED cases only (same logic as the full sweep).
  -- When the member was reactivated, only cases created AFTER the reactivation
  -- count as fresh defaults. Pre-reactivation defaults are settled by the
  -- reinstatement penalty.
  SELECT COUNT(*)::INT INTO v_unpaid_finalized_count
  FROM (
    SELECT c.id
    FROM public.cases c
    WHERE c.is_finalized = TRUE
      AND public.member_case_obligation_applies(p_member_id, c.id)
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
        WHERE t2.member_id = p_member_id AND t2.case_id = c.id
          AND t2.transaction_type IN ('contribution','case_wallet_deduction','arrears','contribution_refund','case_wallet_refund')
          AND COALESCE(LOWER(t2.status),'completed') IN ('completed','success')
      ), 0) < COALESCE(c.contribution_per_member, 0) - 0.009
  ) ob;

  IF COALESCE(v_streak, 0) < 2 AND COALESCE(v_unpaid_finalized_count, 0) < 2 THEN
    RETURN NULL;
  END IF;

  UPDATE public.members
  SET status = 'inactive', is_active = FALSE, updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO public.member_status_transitions (
    member_id, from_status, to_status, from_is_active, to_is_active,
    reason, details, performed_by_role
  ) VALUES (
    p_member_id, v_status, 'inactive', TRUE, FALSE,
    'auto_inactive_two_consecutive_defaults',
    jsonb_build_object(
      'source', 'discipline_scoped_trigger',
      'streak', v_streak,
      'unpaid_finalized_count', v_unpaid_finalized_count
    ),
    'system'
  );

  RETURN 'marked_inactive';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_member_discipline(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.check_member_discipline(UUID) IS
'Scoped per-member discipline check (trigger-called). Aligned with check_and_apply_member_discipline: counts only unpaid FINALIZED cases created after the latest auto-wallet-reactivation. Members in an open cycle (manual reinstatement) are skipped.';

-- ── Part 4: rewrite apply_wallet_payment_waterfall — cases first, penalty last ──
--
-- The committed version (20260727100000) charges the reinstatement penalty
-- BEFORE case obligations (penalty-first). The correct order is:
--   1. Pay unpaid case obligations (finalized first, then oldest active)
--   2. Then charge remaining wallet against the reinstatement penalty
--   3. Reactivate only when the full 300 is accumulated AFTER case payments
--
-- A member in default should satisfy their case obligations before the
-- penalty consumes wallet that could pay down case debt. Partial penalty
-- accumulation across multiple funding events still works (Stage 2 is
-- reached each time the waterfall runs).
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
  -- Measured from the inactivation anchor so partial accumulation works.
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

  -- STAGE 1: pay oldest unpaid cases (finalized + active), oldest first.
  -- This runs for ALL members regardless of status/cycle — cases always
  -- come before the reinstatement penalty.
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

  -- STAGE 2: charge reinstatement penalty from what remains in the wallet
  -- after case obligations have been satisfied. Only applies to inactive
  -- members with an open reactivation cycle.
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
'Pays case obligations first (finalized then oldest active), then charges the reinstatement penalty from remaining wallet. For inactive members with an open reactivation cycle, the penalty is deducted after case payments; once 300 is accumulated the member flips to probation and the default streak is reset.';

-- ── Part 5: Data repair — fix wallets and reactivate falsely inactive members ──
--
-- Two bugs corrupted member state:
--   Bug A (scoped trigger, deployed Jul 26 14:02): check_member_discipline()
--     counted ACTIVE cases + pre-reactivation finalized cases as grounds for
--     inactivation. Members paying down obligations or who had just paid the
--     reinstatement penalty were falsely inactivated.
--
--   Bug B (penalty-first ordering, deployed Jul 26 17:21):
--     apply_wallet_payment_waterfall() charged the 300 reinstatement penalty
--     BEFORE case obligations, consuming wallet that should have paid case
--     debt first.
--
-- Repair: for EVERY member currently inactive:
--   1. Refund all auto_reinstatement_penalty charges back to wallet (reverses
--      Bug B — restores wallet to the state it would have been in under
--      cases-first ordering).
--   2. For members without an open reactivation cycle, evaluate whether the
--      CORRECTED rules (finalized-only, reactivation-scoped) would inactivate
--      them. If not, reactivate to probation + reset streak (repairs Bug A).
--   3. Run the corrected waterfall for all members with positive wallet so
--      remaining funds flow cases-first then penalty.
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
    -- Latest auto-inactivation anchor.
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

    v_open_cycle := v_inactivated_at IS NOT NULL;

    -- Latest auto-reactivation (for reactivation scoping).
    SELECT MAX(t.created_at) FILTER (WHERE t.reason = 'auto_wallet_reactivation')
      INTO v_reactivated_at
    FROM public.member_status_transitions t
    WHERE t.member_id = m.id;

    -- ── Refund penalty charges taken under penalty-first ordering ──────────
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

    -- ── Reactivate if falsely inactivated (no open cycle, fails corrected criteria) ──
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

-- ── Part 6: Re-run the corrected waterfall for members with positive wallet ──
-- Now that the function does cases-first and penalties have been refunded,
-- apply the corrected waterfall so remaining wallet flows to cases first
-- then penalty. This completes the repair for members whose wallet balance
-- was distorted by penalty-first deductions.
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

