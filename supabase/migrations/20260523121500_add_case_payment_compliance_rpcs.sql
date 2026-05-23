-- Server-side compliance rollups for case payment analysis.

CREATE OR REPLACE FUNCTION public.get_case_payment_compliance_rows()
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
WITH eligible_members AS (
  SELECT
    m.id AS member_id,
    m.member_number,
    m.name,
    m.status AS member_status
  FROM public.members m
  WHERE m.status IN ('active', 'probation')
),
eligible_cases AS (
  SELECT
    c.id AS case_id,
    c.case_number,
    c.case_type,
    COALESCE(c.contribution_per_member, 0)::numeric(15,2) AS expected_amount,
    c.is_active,
    c.is_finalized
  FROM public.cases c
  WHERE c.is_active = true OR c.is_finalized = true
),
net_payments AS (
  SELECT
    t.member_id,
    t.case_id,
    SUM(CASE
      WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(COALESCE(t.amount, 0))
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(COALESCE(t.amount, 0))
      ELSE 0
    END)::numeric(15,2) AS net_paid,
    SUM(CASE
      WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(COALESCE(t.amount, 0))
      ELSE 0
    END)::numeric(15,2) AS gross_paid,
    SUM(CASE
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN ABS(COALESCE(t.amount, 0))
      ELSE 0
    END)::numeric(15,2) AS total_refunded
  FROM public.transactions t
  WHERE COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    AND t.member_id IS NOT NULL
    AND t.case_id IS NOT NULL
    AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'contribution_refund', 'case_wallet_refund')
  GROUP BY t.member_id, t.case_id
)
SELECT
  c.case_id,
  c.case_number::text,
  c.case_type::text,
  CASE
    WHEN c.is_finalized THEN 'finalized'
    WHEN c.is_active THEN 'active'
    ELSE 'closed'
  END::text AS case_status,
  m.member_id,
  m.member_number::text,
  m.name::text AS member_name,
  m.member_status::text,
  c.expected_amount::numeric,
  COALESCE(p.gross_paid, 0)::numeric AS gross_paid,
  COALESCE(p.total_refunded, 0)::numeric AS total_refunded,
  COALESCE(p.net_paid, 0)::numeric AS net_paid,
  GREATEST(c.expected_amount - COALESCE(p.net_paid, 0), 0)::numeric AS outstanding_amount,
  CASE
    WHEN COALESCE(p.net_paid, 0) >= c.expected_amount THEN 'paid'
    WHEN COALESCE(p.net_paid, 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END::text AS payment_compliance
FROM eligible_cases c
CROSS JOIN eligible_members m
LEFT JOIN net_payments p
  ON p.case_id = c.case_id
 AND p.member_id = m.member_id
ORDER BY c.case_number DESC, m.member_number;
$$;

CREATE OR REPLACE FUNCTION public.get_case_payment_compliance_summary()
RETURNS TABLE (
  case_id uuid,
  case_number text,
  case_type text,
  case_status text,
  eligible_members int,
  paid_members int,
  partial_members int,
  unpaid_members int,
  expected_total numeric,
  net_paid_total numeric,
  outstanding_total numeric,
  paid_amount_percent numeric,
  paid_members_percent numeric
)
LANGUAGE sql
STABLE
AS $$
WITH rows AS (
  SELECT * FROM public.get_case_payment_compliance_rows()
)
SELECT
  r.case_id,
  r.case_number,
  r.case_type,
  r.case_status,
  COUNT(*)::int AS eligible_members,
  COUNT(*) FILTER (WHERE r.payment_compliance = 'paid')::int AS paid_members,
  COUNT(*) FILTER (WHERE r.payment_compliance = 'partial')::int AS partial_members,
  COUNT(*) FILTER (WHERE r.payment_compliance = 'unpaid')::int AS unpaid_members,
  SUM(r.expected_amount)::numeric AS expected_total,
  SUM(r.net_paid)::numeric AS net_paid_total,
  SUM(r.outstanding_amount)::numeric AS outstanding_total,
  CASE WHEN SUM(r.expected_amount) > 0
    THEN ROUND((SUM(r.net_paid) / SUM(r.expected_amount)) * 100, 2)
    ELSE 0
  END::numeric AS paid_amount_percent,
  CASE WHEN COUNT(*) > 0
    THEN ROUND((COUNT(*) FILTER (WHERE r.payment_compliance = 'paid')::numeric / COUNT(*)) * 100, 2)
    ELSE 0
  END::numeric AS paid_members_percent
FROM rows r
GROUP BY r.case_id, r.case_number, r.case_type, r.case_status
ORDER BY outstanding_total DESC, case_number DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_case_payment_compliance_rows() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_case_payment_compliance_summary() TO anon, authenticated, service_role;
