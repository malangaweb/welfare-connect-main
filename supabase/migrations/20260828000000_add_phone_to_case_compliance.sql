-- Add phone_number to get_case_payment_compliance_rows_for_case so the
-- case-detail "Unpaid" tab can show member phone without extra round-trip.

DROP FUNCTION IF EXISTS public.get_case_payment_compliance_rows_for_case(UUID);

CREATE FUNCTION public.get_case_payment_compliance_rows_for_case(p_case_id UUID)
RETURNS TABLE (
  case_id UUID,
  case_number TEXT,
  case_type TEXT,
  case_status TEXT,
  member_id UUID,
  member_number TEXT,
  member_name TEXT,
  member_status TEXT,
  phone_number TEXT,
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
      m.phone_number,
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
    m.member_id, m.member_number::text, m.name::text, m.member_status::text, m.phone_number::text,
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
