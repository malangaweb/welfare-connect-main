-- Fix three issues found in the waterfall+sweep rewrite (20260718000000):
--
-- 1. DEADLOCK (critical): sweep uses FOR UPDATE over ALL members; waterfall uses
--    FOR UPDATE on ONE member. Two concurrent wallet_funding inserts can deadlock
--    when each sweep tries to lock the other's waterfall-held member. Fix: use
--    SKIP LOCKED so the sweep skips locked members instead of blocking.
--
-- 2. DEAD `ON CONFLICT DO NOTHING` (confusing): the unique index on
--    (member_id, case_id) was dropped in a prior migration. The conflict clause
--    never fires. Remove it.
--
-- 3. GUARD TIMING (fragile): app.auto_wallet_reactivation is set AFTER the
--    penalty insert in Stage 2, so the AFTER STATEMENT discipline trigger that
--    fires on that insert does NOT see the guard. Currently safe because the
--    sweep only checks 'probation'/'active' members and the member is still
--    inactive at that point, but it's fragile. Fix: set guard BEFORE the penalty
--    insert line so the AFTER STATEMENT trigger sees it.

-- ── Part 1: Rewrite apply_wallet_payment_waterfall ──────────────────────────

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

  -- Detect prior open cycle for inactive members. An open cycle is one where the
  -- latest auto_inactive_two_consecutive_defaults transition has NO subsequent
  -- auto_wallet_reactivation. We need this to anchor the penalty bucket.
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

  -- ── Stage 1: pay oldest unpaid cases (both finalized and active), oldest first.
  -- Loop until wallet cannot cover the next case or no unpaid cases remain.
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
      -- finalized/closed cases (missed) first, then active cases.
      -- Within each group: oldest first (case_date asc).
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
      EXIT;  -- not enough funds for the next oldest case
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

  -- ── Stage 2: pay reinstatement penalty (only for inactive members with wallet left)
  IF v_member.status = 'inactive' AND v_open_cycle THEN
    -- Compute penalty paid bucket within the active (open) cycle only.
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
      -- Set guard BEFORE the insert so the AFTER STATEMENT discipline trigger
      -- that fires for this penalty row sees it and skips its sweep.
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

    -- Flip to probation only once the full penalty is paid across cases.
    IF v_penalty_remaining <= 0 THEN
      v_probation_end := (CURRENT_DATE + INTERVAL '3 months')::DATE;

      -- Guard must also be set here for the case where no new penalty insert
      -- was needed (v_penalty_paid already >= 300). Without this, the
      -- wallet_funding AFTER STATEMENT trigger would fire the sweep after
      -- the reactivation and immediately mark the member inactive again.
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

GRANT EXECUTE ON FUNCTION public.apply_wallet_payment_waterfall(UUID) TO service_role;

-- ── Part 2: Rewrite check_and_apply_member_discipline ──────────────────────
-- Uses SKIP LOCKED to avoid deadlocking with concurrent waterfall FOR UPDATE
-- on the same member.

CREATE OR REPLACE FUNCTION public.check_and_apply_member_discipline()
RETURNS TABLE (member_id UUID, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  v_unpaid_count INT := 0;
  v_streak INT := 0;
  v_open_cycle BOOLEAN := FALSE;
BEGIN
  FOR m IN
    SELECT mm.id, mm.status
    FROM public.members mm
    WHERE mm.status IN ('probation', 'active')
    ORDER BY mm.member_number
  LOOP
    -- Attempt to lock, skip if another tx holds this row (e.g., waterfall).
    PERFORM 1 FROM public.members
      WHERE id = m.id AND status = m.status
      FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Skip members who already have an open (unresolved) auto-inactive cycle.
    SELECT EXISTS(
      SELECT 1
      FROM public.member_status_transitions t
      WHERE t.member_id = m.id
        AND t.reason = 'auto_inactive_two_consecutive_defaults'
        AND NOT EXISTS (
          SELECT 1
          FROM public.member_status_transitions later
          WHERE later.member_id = m.id
            AND later.reason = 'auto_wallet_reactivation'
            AND later.created_at > t.created_at
        )
    ) INTO v_open_cycle;

    IF v_open_cycle THEN
      CONTINUE;
    END IF;

    SELECT COALESCE((
      SELECT ds.current_streak FROM public.member_default_streaks ds WHERE ds.member_id = m.id
    ), 0) INTO v_streak;

    SELECT COALESCE(due.unpaid_case_count, 0)::INT INTO v_unpaid_count
    FROM public.get_member_total_due(m.id) due;

    IF COALESCE(v_streak, 0) < 2 AND COALESCE(v_unpaid_count, 0) < 2 THEN
      CONTINUE;
    END IF;

    UPDATE public.members
    SET status = 'inactive',
        is_active = FALSE,
        updated_at = now()
    WHERE id = m.id;

    INSERT INTO public.member_status_transitions (
      member_id, from_status, to_status, from_is_active, to_is_active,
      reason, details, performed_by_role
    ) VALUES (
      m.id, m.status, 'inactive',
      TRUE, FALSE,
      'auto_inactive_two_consecutive_defaults',
      jsonb_build_object(
        'source', 'discipline_sweep',
        'streak', v_streak,
        'unpaid_case_count', v_unpaid_count
      ),
      'system'
    );

    member_id := m.id;
    action := 'marked_inactive';
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_and_apply_member_discipline() IS
'Sweeps active/probation members with member_default_streaks.current_streak >= 2 OR get_member_total_due.unpaid_case_count >= 2. Marks them inactive. Skips members with an open cycle or an already-locked row (SKIP LOCKED). Does not call the wallet waterfall.';

GRANT EXECUTE ON FUNCTION public.check_and_apply_member_discipline() TO authenticated, service_role;
