-- Per-member total due: outstanding case balances + reinstatement penalty.
-- Returns both aggregate totals and per-case breakdown for tooltip display.

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

  -- Case obligations: active/finalized cases with outstanding balance > 0.009
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

  -- Penalty: remaining reinstatement penalty for auto-inactivated members only
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
        AND COALESCE(t.metadata->>'source', '') = 'auto_reinstatement_penalty';

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
