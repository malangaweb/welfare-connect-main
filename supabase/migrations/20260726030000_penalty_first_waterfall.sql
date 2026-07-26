-- Fix: inactive members whose wallet was auto-deducted for the reinstatement
-- penalty stay inactive because the waterfall paid CASE obligations FIRST
-- (Stage 1) and drained the wallet before the 300 penalty (Stage 2) could be
-- met. Members with large case debt could fund far more than 300 and never
-- reach a liquid 300 balance, so execute_member_reinstatement() (which
-- requires wallet_balance >= 300) never succeeded.
--
-- Proof (member 894 / DAMA KAZUNGU KENGA): funded 1910 + 300, paid 1820 to
-- cases + 90 penalty, wallet ended at 0.00, never reinstated.
--
-- Fix: for an inactive member with an OPEN reactivation cycle, charge the
-- reinstatement penalty FIRST (up to 300), flip to probation once met, THEN
-- apply the remaining wallet to case obligations. This lets funding events
-- accumulate toward the 300 penalty independent of case debt.
--
-- Behaviour for active/probation members (and inactive members with NO open
-- cycle) is unchanged: cases are paid first as before.

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
        v_target_member_id := p_member_id;
      END IF;
    END IF;
  END IF;

  -- STAGE 1: pay oldest unpaid cases (finalized + active), oldest first.
  -- For an inactive member still awaiting the full penalty, defer case
  -- payments until the penalty requirement is met (penalty-first).
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
    -- Penalty-first: an inactive member with an open cycle and unpaid penalty
    -- should not spend wallet on cases until the penalty is satisfied.
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

  -- STAGE 2 (legacy): if penalty was NOT charged first (e.g. active/probation
  -- member, or inactive with no open cycle), keep the original penalty block
  -- so manual/admin penalty payments are still recognised.
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
'Pays case obligations and the reinstatement penalty from the wallet. For inactive members with an open reactivation cycle the penalty is charged FIRST so funding accumulates toward the 300 threshold before case debt consumes the balance.';

-- ── Part 2: backfill members who already PAID the full 300 reinstatement
-- penalty (via auto_reinstatement_penalty) but were never flipped to probation
-- because the old ordering let case debt drain the wallet first, or because the
-- penalty was paid in a prior cycle and not re-credited after re-inactivation.
--
-- These members satisfy the penalty requirement; we restore them to probation
-- using the same sanctioned guard the waterfall uses (app.auto_wallet_reactivation).
DO $$
DECLARE
  m RECORD;
  v_inactivated_at TIMESTAMPTZ;
  v_penalty_paid NUMERIC;
  v_funded NUMERIC;
  v_probation_end DATE;
BEGIN
  FOR m IN
    SELECT mb.id, mb.member_number, mb.name
    FROM public.members mb
    WHERE mb.status = 'inactive'
  LOOP
    -- open cycle?
    SELECT t.created_at INTO v_inactivated_at
    FROM public.member_status_transitions t
    WHERE t.member_id = m.id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (SELECT 1 FROM public.member_status_transitions later
        WHERE later.member_id = m.id AND later.reason = 'auto_wallet_reactivation'
          AND later.created_at > t.created_at)
    ORDER BY t.created_at DESC LIMIT 1;

    IF v_inactivated_at IS NULL THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(ABS(t.amount)), 0)
      INTO v_penalty_paid
    FROM public.transactions t
    WHERE t.member_id = m.id
      AND t.transaction_type = 'penalty'
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
      AND COALESCE(t.metadata->>'source', '') = 'auto_reinstatement_penalty';

    SELECT COALESCE(SUM(t.amount), 0)
      INTO v_funded
    FROM public.transactions t
    WHERE t.member_id = m.id
      AND t.transaction_type = 'wallet_funding'
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success');

    -- Fully paid the penalty AND has funded at least the penalty amount.
    IF v_penalty_paid >= 300 AND v_funded >= 300 THEN
      PERFORM set_config('app.auto_wallet_reactivation', 'true', true);
      v_probation_end := (CURRENT_DATE + INTERVAL '90 days')::DATE;
      UPDATE public.members
      SET status = 'probation', is_active = TRUE, probation_end_date = v_probation_end, updated_at = now()
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
          'source', 'backfill_penalty_first_fix'
        ),
        'system'
      );
      RAISE NOTICE 'Backfill reinstated member #% (%) penalty=% funded=%',
        m.member_number, m.name, v_penalty_paid, v_funded;
    END IF;
  END LOOP;
END;
$$;
