-- 1. Fix source-tag segregation: `api_collect_fee` penalties also count toward
--    the reinstatement KES 300 requirement, preventing double-payment when an
--    admin charges a fee-penalty against an inactive member.
-- 2. Add discipline sweep: marks legacy (non-auto-reactivated) probation members
--    with a default streak >= 2 as inactive, since the existing discipline
--    trigger only fires on case finalization.

-- ── Part A: Fix source-tag in apply_wallet_payment_waterfall ──────────────

CREATE OR REPLACE FUNCTION public.apply_wallet_payment_waterfall(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_case RECORD;
  v_inactivated_at TIMESTAMPTZ;
  v_penalty_required NUMERIC := 300;
  v_penalty_paid NUMERIC := 0;
  v_penalty_remaining NUMERIC := 0;
  v_wallet NUMERIC := 0;
  v_payment NUMERIC := 0;
  v_case_paid NUMERIC := 0;
  v_case_remaining NUMERIC := 0;
  v_probation_end DATE;
  v_penalty_tx_count INT := 0;
  v_finalized_case_count INT := 0;
  v_active_case_count INT := 0;
  v_finalized_case_blocked BOOLEAN := FALSE;
BEGIN
  SELECT id, status, is_active
  INTO v_member
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_member.status = 'deceased' THEN
    RETURN jsonb_build_object('success', TRUE, 'skipped', 'member_not_payable');
  END IF;

  IF v_member.status = 'inactive' THEN
    SELECT created_at
    INTO v_inactivated_at
    FROM public.member_status_transitions
    WHERE member_id = p_member_id
      AND reason = 'auto_inactive_two_consecutive_defaults'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_inactivated_at IS NOT NULL THEN
      SELECT COALESCE(SUM(ABS(amount)), 0)
      INTO v_penalty_paid
      FROM public.transactions
      WHERE member_id = p_member_id
        AND transaction_type = 'penalty'
        AND COALESCE(LOWER(status), 'completed') IN ('completed', 'success')
        AND created_at >= v_inactivated_at
        AND COALESCE(metadata->>'source', '') IN ('auto_reinstatement_penalty', 'api_collect_fee');

      v_penalty_remaining := GREATEST(v_penalty_required - v_penalty_paid, 0);
      v_wallet := public.calculate_wallet_balance(p_member_id);

      IF v_penalty_remaining > 0 AND v_wallet > 0 THEN
        v_payment := LEAST(v_wallet, v_penalty_remaining);

        INSERT INTO public.transactions (
          member_id, amount, transaction_type, payment_method, status,
          description, reference, metadata
        ) VALUES (
          p_member_id, v_payment, 'penalty', 'wallet', 'completed',
          'Automatic reinstatement penalty payment',
          'auto_reinstatement_penalty:' || p_member_id::TEXT || ':' || EXTRACT(EPOCH FROM now())::BIGINT,
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

      IF v_penalty_remaining > 0 THEN
        RETURN jsonb_build_object(
          'success', TRUE,
          'status', 'inactive',
          'penalty_paid', v_penalty_paid,
          'penalty_remaining', v_penalty_remaining,
          'cases_paid', 0
        );
      END IF;

      v_probation_end := (CURRENT_DATE + INTERVAL '3 months')::DATE;
      PERFORM set_config('app.auto_wallet_reactivation', 'true', true);

      UPDATE public.members
      SET status = 'probation',
          is_active = TRUE,
          probation_end_date = v_probation_end,
          updated_at = now()
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
    ELSE
      RETURN jsonb_build_object('success', TRUE, 'skipped', 'inactive_not_auto_inactivated');
    END IF;
  END IF;

  FOR v_case IN
    SELECT c.id, c.case_number, COALESCE(c.contribution_per_member, 0) AS required_amount
    FROM public.cases c
    WHERE c.is_finalized = TRUE
      AND public.member_case_obligation_applies(p_member_id, c.id)
    ORDER BY COALESCE(c.end_date, c.start_date, c.created_at::DATE), c.created_at, c.id
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
    v_wallet := public.calculate_wallet_balance(p_member_id);

    IF v_case_remaining > 0 THEN
      IF v_wallet < v_case_remaining THEN
        v_finalized_case_blocked := TRUE;
        EXIT;
      END IF;

      INSERT INTO public.transactions (
        member_id, case_id, amount, transaction_type, payment_method, status,
        description, metadata
      ) VALUES (
        p_member_id, v_case.id, v_case_remaining, 'arrears', 'wallet', 'completed',
        'Automatic finalized-case payment for case #' || v_case.case_number,
        jsonb_build_object('source', 'auto_wallet_payment_waterfall', 'priority', 'finalized_case')
      );
      v_finalized_case_count := v_finalized_case_count + 1;
    END IF;
  END LOOP;

  IF v_finalized_case_blocked THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'penalty_payments', v_penalty_tx_count,
      'finalized_cases_paid', v_finalized_case_count,
      'active_cases_paid', 0,
      'wallet_balance', public.calculate_wallet_balance(p_member_id)
    );
  END IF;

  FOR v_case IN
    SELECT c.id, c.case_number, COALESCE(c.contribution_per_member, 0) AS required_amount
    FROM public.cases c
    WHERE c.is_active = TRUE
      AND COALESCE(c.is_finalized, FALSE) = FALSE
      AND public.member_case_obligation_applies(p_member_id, c.id)
    ORDER BY COALESCE(c.start_date, c.created_at::DATE), c.created_at, c.id
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
    v_wallet := public.calculate_wallet_balance(p_member_id);

    IF v_case_remaining > 0 THEN
      IF v_wallet < v_case_remaining THEN
        EXIT;
      END IF;

      INSERT INTO public.transactions (
        member_id, case_id, amount, transaction_type, payment_method, status,
        description, metadata
      ) VALUES (
        p_member_id, v_case.id, v_case_remaining, 'case_wallet_deduction', 'wallet', 'completed',
        'Automatic active-case payment for case #' || v_case.case_number,
        jsonb_build_object('source', 'auto_wallet_payment_waterfall', 'priority', 'active_case')
      ) ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_active_case_count := v_active_case_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'penalty_payments', v_penalty_tx_count,
    'finalized_cases_paid', v_finalized_case_count,
    'active_cases_paid', v_active_case_count,
    'wallet_balance', public.calculate_wallet_balance(p_member_id)
  );
END;
$$;

-- ── Part B: Fix source-tag in get_member_total_due ────────────────────────

CREATE OR REPLACE FUNCTION public.get_member_total_due(p_member_id UUID)
RETURNS TABLE (
  unpaid_case_count INT,
  unpaid_case_total NUMERIC,
  reinstatement_penalty_due NUMERIC,
  total_due NUMERIC,
  case_details JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_status TEXT;
  v_auto_inactivated_at TIMESTAMPTZ;
  v_penalty_paid NUMERIC;
  v_case_count INT := 0;
  v_case_total NUMERIC := 0;
  v_penalty_due NUMERIC := 0;
  v_case_details JSONB;
BEGIN
  SELECT m.status INTO v_status
  FROM public.members m
  WHERE m.id = p_member_id;

  IF v_status IS NULL THEN
    RETURN QUERY SELECT 0::INT, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, '[]'::JSONB;
    RETURN;
  END IF;

  WITH outstanding AS (
    SELECT
      c.id AS case_id,
      c.case_number,
      COALESCE(c.contribution_per_member, 0)::NUMERIC AS expected_amount,
      CASE WHEN c.is_finalized THEN 'closed' WHEN c.is_active THEN 'active' ELSE 'other' END::TEXT AS case_status,
      COALESCE(c.end_date, c.start_date, c.created_at::DATE) AS case_date,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN t2.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(COALESCE(t2.amount, 0))
            WHEN t2.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(COALESCE(t2.amount, 0))
            ELSE 0
          END
        )::NUMERIC
        FROM public.transactions t2
        WHERE t2.member_id = p_member_id
          AND t2.case_id = c.id
          AND t2.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears', 'contribution_refund', 'case_wallet_refund')
          AND COALESCE(LOWER(t2.status), 'completed') IN ('completed', 'success')
      ), 0) AS net_paid
    FROM public.cases c
    WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
      AND public.member_case_obligation_applies(p_member_id, c.id)
  )
  SELECT
    COUNT(*)::INT,
    COALESCE(SUM(GREATEST(expected_amount - net_paid, 0)), 0)::NUMERIC,
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'case_id', case_id,
        'case_number', case_number,
        'contribution_per_member', expected_amount,
        'case_status', case_status,
        'case_date', case_date
      )
      ORDER BY case_date DESC, case_number
    ) FILTER (WHERE expected_amount - net_paid > 0.009), '[]'::JSONB)
  INTO v_case_count, v_case_total, v_case_details
  FROM outstanding
  WHERE expected_amount - net_paid > 0.009;

  IF v_status = 'inactive' THEN
    SELECT st.created_at INTO v_auto_inactivated_at
    FROM public.member_status_transitions st
    WHERE st.member_id = p_member_id
      AND st.to_status = 'inactive'
      AND st.reason = 'auto_inactive_two_consecutive_defaults'
    ORDER BY st.created_at DESC
    LIMIT 1;

    IF v_auto_inactivated_at IS NOT NULL THEN
      SELECT COALESCE(SUM(ABS(t.amount)), 0) INTO v_penalty_paid
      FROM public.transactions t
      WHERE t.member_id = p_member_id
        AND t.transaction_type = 'penalty'
        AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
        AND t.created_at >= v_auto_inactivated_at
        AND COALESCE(t.metadata->>'source', '') IN ('auto_reinstatement_penalty', 'api_collect_fee');

      v_penalty_due := GREATEST(300 - v_penalty_paid, 0);
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v_case_count,
    v_case_total,
    v_penalty_due,
    (v_case_total + v_penalty_due)::NUMERIC,
    v_case_details;
END;
$$;

COMMENT ON FUNCTION public.get_member_total_due(UUID) IS
'Returns case obligation count, outstanding case total, remaining reinstatement penalty, combined total due, and per-case breakdown JSON.';

GRANT EXECUTE ON FUNCTION public.get_member_total_due(UUID) TO anon, authenticated, service_role;

-- ── Part C: Fix source-tag in get_case_payment_compliance_rows_for_case ──

CREATE OR REPLACE FUNCTION public.get_case_payment_compliance_rows_for_case(p_case_id UUID)
RETURNS TABLE (
  case_id UUID,
  case_number TEXT,
  case_type TEXT,
  case_status TEXT,
  member_id UUID,
  member_number TEXT,
  member_name TEXT,
  member_status TEXT,
  expected_amount NUMERIC,
  gross_paid NUMERIC,
  total_refunded NUMERIC,
  net_paid NUMERIC,
  outstanding_amount NUMERIC,
  reinstatement_penalty_due NUMERIC,
  total_due NUMERIC,
  payment_compliance TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH eligible_case AS (
    SELECT c.id AS case_id, c.case_number, c.case_type,
      COALESCE(c.contribution_per_member, 0)::numeric(15,2) AS expected_amount,
      c.is_active, c.is_finalized
    FROM public.cases c
    WHERE c.id = p_case_id AND (c.is_active = TRUE OR c.is_finalized = TRUE)
  ),
  member_inactivation AS (
    SELECT
      m.id AS member_id,
      m.member_number,
      m.name,
      m.status AS member_status,
      latest_transition.created_at AS auto_inactivated_at
    FROM public.members m
    LEFT JOIN LATERAL (
      SELECT st.created_at
      FROM public.member_status_transitions st
      WHERE st.member_id = m.id
        AND st.to_status = 'inactive'
        AND st.reason = 'auto_inactive_two_consecutive_defaults'
      ORDER BY st.created_at DESC
      LIMIT 1
    ) latest_transition ON TRUE
    WHERE m.status IN ('active', 'probation')
       OR (m.status = 'inactive' AND latest_transition.created_at IS NOT NULL)
  ),
  penalty_balances AS (
    SELECT
      m.member_id,
      CASE
        WHEN m.member_status = 'inactive' AND m.auto_inactivated_at IS NOT NULL THEN
          GREATEST(300 - COALESCE((
            SELECT SUM(ABS(t.amount))
            FROM public.transactions t
            WHERE t.member_id = m.member_id
              AND t.transaction_type = 'penalty'
              AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
              AND t.created_at >= m.auto_inactivated_at
              AND COALESCE(t.metadata->>'source', '') IN ('auto_reinstatement_penalty', 'api_collect_fee')
          ), 0), 0)::numeric
        ELSE 0::numeric
      END AS reinstatement_penalty_due
    FROM member_inactivation m
  ),
  net_payments AS (
    SELECT t.member_id, t.case_id,
      SUM(CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(COALESCE(t.amount, 0))
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(COALESCE(t.amount, 0))
        ELSE 0 END)::numeric(15,2) AS net_paid,
      SUM(CASE WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(COALESCE(t.amount, 0)) ELSE 0 END)::numeric(15,2) AS gross_paid,
      SUM(CASE WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN ABS(COALESCE(t.amount, 0)) ELSE 0 END)::numeric(15,2) AS total_refunded
    FROM public.transactions t
    WHERE t.case_id = p_case_id
      AND t.member_id IS NOT NULL
      AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears', 'contribution_refund', 'case_wallet_refund')
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    GROUP BY t.member_id, t.case_id
  )
  SELECT
    c.case_id, c.case_number::text, c.case_type::text,
    CASE WHEN c.is_finalized THEN 'finalized' WHEN c.is_active THEN 'active' ELSE 'closed' END::text,
    m.member_id, m.member_number::text, m.name::text, m.member_status::text,
    c.expected_amount::numeric,
    COALESCE(p.gross_paid, 0)::numeric,
    COALESCE(p.total_refunded, 0)::numeric,
    COALESCE(p.net_paid, 0)::numeric,
    GREATEST(c.expected_amount - COALESCE(p.net_paid, 0), 0)::numeric AS outstanding_amount,
    COALESCE(pb.reinstatement_penalty_due, 0)::numeric AS reinstatement_penalty_due,
    (GREATEST(c.expected_amount - COALESCE(p.net_paid, 0), 0) + COALESCE(pb.reinstatement_penalty_due, 0))::numeric AS total_due,
    CASE
      WHEN COALESCE(p.net_paid, 0) >= c.expected_amount THEN 'paid'
      WHEN COALESCE(p.net_paid, 0) > 0 THEN 'partial'
      ELSE 'unpaid'
    END::text
  FROM eligible_case c
  CROSS JOIN member_inactivation m
  LEFT JOIN penalty_balances pb ON pb.member_id = m.member_id
  LEFT JOIN net_payments p ON p.case_id = c.case_id AND p.member_id = m.member_id
  WHERE public.member_case_obligation_applies(m.member_id, c.case_id)
  ORDER BY m.member_number, m.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_case_payment_compliance_rows_for_case(UUID) TO anon, authenticated, service_role;

-- ── Part D: Discipline sweep function ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_and_apply_member_discipline()
RETURNS TABLE (member_id UUID, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  m RECORD;
  v_latest_reason TEXT;
BEGIN
  FOR m IN
    SELECT mm.id, mm.status, ds.current_streak
    FROM public.members mm
    JOIN public.member_default_streaks ds ON ds.member_id = mm.id
    WHERE mm.status = 'probation'
      AND ds.current_streak >= 2
  LOOP
    SELECT st.reason INTO v_latest_reason
    FROM public.member_status_transitions st
    WHERE st.member_id = m.id
    ORDER BY st.created_at DESC
    LIMIT 1;

    -- Skip members auto-reactivated via the wallet waterfall — the existing
    -- case-finalization trigger handles them correctly (resets streak on paid
    -- case, increments on default).  Only legacy probation members with a
    -- fresh 2+ streak are marked inactive here.
    IF v_latest_reason = 'auto_wallet_reactivation' THEN
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
      m.id, 'probation', 'inactive',
      TRUE, FALSE,
      'auto_inactive_two_consecutive_defaults',
      jsonb_build_object(
        'source', 'discipline_sweep',
        'streak', m.current_streak
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
'Sweeps probation members with member_default_streaks.current_streak >= 2. Skips auto-reactivated members (waterfall). Marks legacy probation members as inactive.';

GRANT EXECUTE ON FUNCTION public.check_and_apply_member_discipline() TO authenticated, service_role;

-- ── Part E: Hook discipline sweep into collect_member_fee ─────────────────

CREATE OR REPLACE FUNCTION public.collect_member_fee(
  p_member_id UUID,
  p_fee_type TEXT DEFAULT 'registration',
  p_amount NUMERIC DEFAULT 0,
  p_reference TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_actor TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fee_type text := lower(trim(coalesce(p_fee_type, '')));
  v_amount numeric := coalesce(p_amount, 0);
  v_tx_amount numeric;
  v_now timestamptz := now();
BEGIN
  IF p_member_id IS NULL THEN RAISE EXCEPTION 'member_id is required'; END IF;
  IF v_fee_type NOT IN ('registration', 'renewal', 'penalty') THEN
    RAISE EXCEPTION 'fee_type must be one of registration/renewal/penalty';
  END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'amount must be greater than zero'; END IF;

  PERFORM 1
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;

  v_tx_amount := -abs(v_amount);
  INSERT INTO public.transactions (
    member_id, amount, transaction_type, payment_method, status,
    mpesa_reference, reference, description, created_at, metadata
  ) VALUES (
    p_member_id, v_tx_amount, v_fee_type,
    CASE WHEN nullif(trim(coalesce(p_reference, '')), '') IS NULL THEN 'manual' ELSE 'mpesa' END,
    'completed', nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_reference, '')), ''),
    coalesce(nullif(trim(coalesce(p_description, '')), ''), initcap(v_fee_type) || ' fee payment'), v_now,
    jsonb_build_object('source', 'api_collect_fee', 'fee_type', v_fee_type,
      'reference', nullif(trim(coalesce(p_reference, '')), ''), 'actor', nullif(trim(coalesce(p_actor, '')), ''))
  );

  INSERT INTO public.audit_logs (action, table_name, record_id, status, metadata, timestamp)
  VALUES ('FEE_COLLECTION', 'transactions', p_member_id::text, 'success',
    jsonb_build_object('member_id', p_member_id, 'fee_type', v_fee_type, 'amount', v_amount,
      'reference', nullif(trim(coalesce(p_reference, '')), ''), 'reactivated', FALSE), v_now);

  -- Run the discipline sweep: marks legacy probation members with streak >= 2
  -- as inactive.  This is safe to run on every fee collection — it's a fast
  -- check and keeps the system tidy without relying solely on case finalization.
  PERFORM public.check_and_apply_member_discipline();

  RETURN json_build_object('success', true, 'member_id', p_member_id, 'fee_type', v_fee_type, 'amount', v_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.collect_member_fee(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;
