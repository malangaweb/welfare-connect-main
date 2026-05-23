-- Compliance: case-payment status for active and probation members only.
-- Shows each active/probation member's net payment position per active/finalized case,
-- then summarizes paid/partial/unpaid compliance per case.

-- 1) Member-by-case case payment compliance.
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
    COALESCE(c.contribution_per_member, 0)::NUMERIC(15,2) AS expected_amount,
    c.start_date,
    c.end_date,
    c.is_active,
    c.is_finalized
  FROM public.cases c
  WHERE c.is_active = TRUE
     OR c.is_finalized = TRUE
),
net_payments AS (
  SELECT
    t.member_id,
    t.case_id,
    SUM(
      CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(COALESCE(t.amount, 0))
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(COALESCE(t.amount, 0))
        ELSE 0
      END
    )::NUMERIC(15,2) AS net_paid,
    SUM(
      CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(COALESCE(t.amount, 0))
        ELSE 0
      END
    )::NUMERIC(15,2) AS gross_paid,
    SUM(
      CASE
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN ABS(COALESCE(t.amount, 0))
        ELSE 0
      END
    )::NUMERIC(15,2) AS total_refunded
  FROM public.transactions t
  WHERE COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    AND t.member_id IS NOT NULL
    AND t.case_id IS NOT NULL
    AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'contribution_refund', 'case_wallet_refund')
  GROUP BY t.member_id, t.case_id
)
SELECT
  c.case_id,
  c.case_number,
  c.case_type,
  CASE
    WHEN c.is_finalized THEN 'finalized'
    WHEN c.is_active THEN 'active'
    ELSE 'closed'
  END AS case_status,
  m.member_id,
  m.member_number,
  m.name,
  m.member_status,
  c.expected_amount,
  COALESCE(p.gross_paid, 0)::NUMERIC(15,2) AS gross_paid,
  COALESCE(p.total_refunded, 0)::NUMERIC(15,2) AS total_refunded,
  COALESCE(p.net_paid, 0)::NUMERIC(15,2) AS net_paid,
  GREATEST(c.expected_amount - COALESCE(p.net_paid, 0), 0)::NUMERIC(15,2) AS outstanding_amount,
  CASE
    WHEN COALESCE(p.net_paid, 0) >= c.expected_amount THEN 'paid'
    WHEN COALESCE(p.net_paid, 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END AS payment_compliance
FROM eligible_cases c
CROSS JOIN eligible_members m
LEFT JOIN net_payments p
  ON p.case_id = c.case_id
 AND p.member_id = m.member_id
ORDER BY c.case_number DESC, payment_compliance DESC, m.member_number;

-- 2) Per-case compliance summary for active/probation members.
WITH eligible_members AS (
  SELECT
    m.id AS member_id
  FROM public.members m
  WHERE m.status IN ('active', 'probation')
),
eligible_cases AS (
  SELECT
    c.id AS case_id,
    c.case_number,
    c.case_type,
    COALESCE(c.contribution_per_member, 0)::NUMERIC(15,2) AS expected_amount,
    c.is_active,
    c.is_finalized
  FROM public.cases c
  WHERE c.is_active = TRUE
     OR c.is_finalized = TRUE
),
net_payments AS (
  SELECT
    t.member_id,
    t.case_id,
    SUM(
      CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(COALESCE(t.amount, 0))
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(COALESCE(t.amount, 0))
        ELSE 0
      END
    )::NUMERIC(15,2) AS net_paid
  FROM public.transactions t
  WHERE COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    AND t.member_id IS NOT NULL
    AND t.case_id IS NOT NULL
    AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'contribution_refund', 'case_wallet_refund')
  GROUP BY t.member_id, t.case_id
),
member_case_status AS (
  SELECT
    c.case_id,
    c.case_number,
    c.case_type,
    c.expected_amount,
    c.is_active,
    c.is_finalized,
    COALESCE(p.net_paid, 0)::NUMERIC(15,2) AS net_paid,
    GREATEST(c.expected_amount - COALESCE(p.net_paid, 0), 0)::NUMERIC(15,2) AS outstanding_amount
  FROM eligible_cases c
  CROSS JOIN eligible_members m
  LEFT JOIN net_payments p
    ON p.case_id = c.case_id
   AND p.member_id = m.member_id
)
SELECT
  case_id,
  case_number,
  case_type,
  CASE
    WHEN is_finalized THEN 'finalized'
    WHEN is_active THEN 'active'
    ELSE 'closed'
  END AS case_status,
  COUNT(*)::INT AS eligible_members,
  COUNT(*) FILTER (WHERE net_paid >= expected_amount)::INT AS paid_members,
  COUNT(*) FILTER (WHERE net_paid > 0 AND net_paid < expected_amount)::INT AS partial_members,
  COUNT(*) FILTER (WHERE net_paid <= 0)::INT AS unpaid_members,
  SUM(expected_amount)::NUMERIC(15,2) AS expected_total,
  SUM(net_paid)::NUMERIC(15,2) AS net_paid_total,
  SUM(outstanding_amount)::NUMERIC(15,2) AS outstanding_total,
  ROUND(
    (COUNT(*) FILTER (WHERE net_paid >= expected_amount)::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS paid_compliance_percent
FROM member_case_status
GROUP BY case_id, case_number, case_type, is_active, is_finalized
ORDER BY outstanding_total DESC, case_number DESC;
