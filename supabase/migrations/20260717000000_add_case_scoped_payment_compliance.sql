-- Case Details needs a complete obligation list, including members with no
-- payment transaction. Keep the same canonical accounting as compliance reports.
CREATE OR REPLACE FUNCTION public.get_case_payment_compliance_rows_for_case(p_case_id UUID)
RETURNS TABLE (
  case_id uuid,
  case_number text,
  case_type text,
  case_status text,
  member_id uuid,
  member_number text,
  member_name text,
  member_status text,
  expected_amount numeric,
  gross_paid numeric,
  total_refunded numeric,
  net_paid numeric,
  outstanding_amount numeric,
  payment_compliance text
)
LANGUAGE sql
STABLE
AS $$
WITH eligible_case AS (
  SELECT
    c.id AS case_id,
    c.case_number,
    c.case_type,
    COALESCE(c.contribution_per_member, 0)::numeric(15,2) AS expected_amount,
    c.is_active,
    c.is_finalized
  FROM public.cases c
  WHERE c.id = p_case_id
    AND (c.is_active = TRUE OR c.is_finalized = TRUE)
),
eligible_members AS (
  SELECT m.id AS member_id, m.member_number, m.name, m.status AS member_status
  FROM public.members m
  WHERE m.status IN ('active', 'probation')
),
net_payments AS (
  SELECT
    t.member_id,
    t.case_id,
    SUM(CASE
      WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(COALESCE(t.amount, 0))
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(COALESCE(t.amount, 0))
      ELSE 0
    END)::numeric(15,2) AS net_paid,
    SUM(CASE
      WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(COALESCE(t.amount, 0))
      ELSE 0
    END)::numeric(15,2) AS gross_paid,
    SUM(CASE
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN ABS(COALESCE(t.amount, 0))
      ELSE 0
    END)::numeric(15,2) AS total_refunded
  FROM public.transactions t
  WHERE t.case_id = p_case_id
    AND t.member_id IS NOT NULL
    AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears', 'contribution_refund', 'case_wallet_refund')
    AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
  GROUP BY t.member_id, t.case_id
)
SELECT
  c.case_id,
  c.case_number::text,
  c.case_type::text,
  CASE WHEN c.is_finalized THEN 'finalized' WHEN c.is_active THEN 'active' ELSE 'closed' END::text,
  m.member_id,
  m.member_number::text,
  m.name::text,
  m.member_status::text,
  c.expected_amount::numeric,
  COALESCE(p.gross_paid, 0)::numeric,
  COALESCE(p.total_refunded, 0)::numeric,
  COALESCE(p.net_paid, 0)::numeric,
  GREATEST(c.expected_amount - COALESCE(p.net_paid, 0), 0)::numeric,
  CASE
    WHEN COALESCE(p.net_paid, 0) >= c.expected_amount THEN 'paid'
    WHEN COALESCE(p.net_paid, 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END::text
FROM eligible_case c
CROSS JOIN eligible_members m
LEFT JOIN net_payments p
  ON p.case_id = c.case_id
 AND p.member_id = m.member_id
WHERE public.member_case_obligation_applies(m.member_id, c.case_id)
ORDER BY m.member_number, m.name;
$$;

COMMENT ON FUNCTION public.get_case_payment_compliance_rows_for_case(UUID) IS
'Returns all applicable active/probation member obligations for one active or finalized case, with net paid, outstanding, and payment status.';

GRANT EXECUTE ON FUNCTION public.get_case_payment_compliance_rows_for_case(UUID) TO anon, authenticated, service_role;
