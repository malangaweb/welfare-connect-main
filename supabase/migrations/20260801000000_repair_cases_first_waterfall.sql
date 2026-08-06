-- Repair the deployed waterfall without disabling automatic deductions.
--
-- 1. Cases are paid before reinstatement penalties.
-- 2. A penalty is not charged while any payable case remains outstanding.
-- 3. Repair only the two confirmed 120-unit penalty deductions identified in
--    the member investigations, then re-run the waterfall for those members.

CREATE OR REPLACE FUNCTION public.apply_wallet_payment_waterfall(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member RECORD;
  v_case RECORD;
  v_case_paid NUMERIC := 0;
  v_case_remaining NUMERIC := 0;
  v_wallet NUMERIC := 0;
  v_penalty_required NUMERIC := 300;
  v_penalty_paid NUMERIC := 0;
  v_penalty_remaining NUMERIC := 0;
  v_payment NUMERIC := 0;
  v_inactivated_at TIMESTAMPTZ;
  v_open_cycle BOOLEAN := FALSE;
  v_case_unpaid BOOLEAN := FALSE;
  v_penalty_tx_count INT := 0;
  v_finalized_paid INT := 0;
  v_active_paid INT := 0;
  v_target_member_id UUID;
  v_probation_end DATE;
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
    SELECT t.created_at
      INTO v_inactivated_at
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

    IF v_open_cycle THEN
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
  END IF;

  -- Cases-first: pay complete oldest obligations only. If the next case
  -- cannot be fully paid, remember that and block the penalty stage below.
  FOR v_case IN
    SELECT c.id,
           c.case_number,
           c.is_finalized,
           COALESCE(c.contribution_per_member, 0) AS required_amount
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
      v_case_unpaid := TRUE;
      EXIT;
    END IF;

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

  -- Penalty is only eligible after every payable case has been settled.
  IF v_member.status = 'inactive'
     AND v_open_cycle
     AND NOT v_case_unpaid
     AND v_penalty_remaining > 0 THEN
    v_wallet := public.calculate_wallet_balance(p_member_id);

    IF v_wallet > 0 THEN
      v_payment := LEAST(v_wallet, v_penalty_remaining);
      INSERT INTO public.transactions (
        member_id, amount, transaction_type, payment_method, status,
        created_at, description, reference, metadata
      ) VALUES (
        p_member_id, v_payment, 'penalty', 'wallet', 'completed',
        clock_timestamp(),
        'Automatic reinstatement penalty payment',
        'auto_reinstatement_penalty:' || p_member_id::TEXT || ':' || EXTRACT(EPOCH FROM clock_timestamp())::BIGINT,
        jsonb_build_object(
          'source', 'auto_reinstatement_penalty',
          'inactivation_at', v_inactivated_at,
          'required_amount', v_penalty_required,
          'partial_payment', v_payment < v_penalty_remaining
        )
      );
      v_penalty_tx_count := 1;
      v_penalty_paid := v_penalty_paid + v_payment;
      v_penalty_remaining := GREATEST(v_penalty_required - v_penalty_paid, 0);
    END IF;

    IF v_penalty_remaining <= 0 THEN
      v_probation_end := (CURRENT_DATE + INTERVAL '90 days')::DATE;
      UPDATE public.members
      SET status = 'probation', is_active = TRUE,
          probation_end_date = v_probation_end, updated_at = now()
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

-- Reverse only the two investigated 120-unit penalty deductions. The repair
-- is guarded by exact IDs, amount, type, source, and status so it is safe to
-- re-run and cannot touch unrelated historical penalties.
UPDATE public.transactions
SET status = 'reversed',
    description = COALESCE(description, '') || ' [REVERSED: cases-first repair]',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'repaired', TRUE,
      'repair_reason', 'cases_first_repair_member_investigation',
      'reversed_at', clock_timestamp()
    )
WHERE id = '8827afa1-3958-4b8c-bc45-2caed739310f'
  AND member_id = 'ee959910-4058-41b9-99be-1cbcb1b0f9d3'
  AND amount = 120
  AND transaction_type = 'penalty'
  AND status = 'completed'
  AND metadata->>'source' = 'auto_reinstatement_penalty';

UPDATE public.transactions
SET status = 'reversed',
    description = COALESCE(description, '') || ' [REVERSED: cases-first repair]',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'repaired', TRUE,
      'repair_reason', 'cases_first_repair_member_investigation',
      'reversed_at', clock_timestamp()
    )
WHERE id = '8b21d31b-ac3f-47f3-9baf-773abce311d3'
  AND member_id = '732029a4-ba91-4d6f-8531-64d987aaa044'
  AND amount = 120
  AND transaction_type = 'penalty'
  AND status = 'completed'
  AND metadata->>'source' = 'auto_reinstatement_penalty';

-- Re-apply the repaired waterfall immediately. Cases are paid first and any
-- remaining balance is retained while cases are still outstanding.
SELECT public.apply_wallet_payment_waterfall('ee959910-4058-41b9-99be-1cbcb1b0f9d3');
SELECT public.apply_wallet_payment_waterfall('732029a4-ba91-4d6f-8531-64d987aaa044');
