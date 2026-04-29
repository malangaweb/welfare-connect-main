-- Forensics: detect likely duplicate case refunds (+120/+240 style credits)
-- and members/cases that are currently over-refunded.

-- 1) Near-time duplicate refunds (same member + case + amount within 10 minutes).
WITH refunds AS (
  SELECT
    t.id,
    t.member_id,
    t.case_id,
    m.member_number,
    m.name,
    ABS(COALESCE(t.amount, 0))::NUMERIC(15,2) AS amount_abs,
    t.created_at,
    t.transaction_type,
    t.description,
    t.status
  FROM public.transactions t
  JOIN public.members m ON m.id = t.member_id
  WHERE t.transaction_type IN ('contribution_refund', 'case_wallet_refund')
    AND COALESCE(t.status, 'completed') = 'completed'
), paired AS (
  SELECT
    a.member_id,
    a.case_id,
    a.member_number,
    a.name,
    a.amount_abs,
    a.id AS tx_id_1,
    b.id AS tx_id_2,
    a.created_at AS created_at_1,
    b.created_at AS created_at_2,
    EXTRACT(EPOCH FROM (b.created_at - a.created_at))::INT AS seconds_apart
  FROM refunds a
  JOIN refunds b
    ON a.member_id = b.member_id
   AND a.case_id = b.case_id
   AND a.amount_abs = b.amount_abs
   AND a.id < b.id
   AND b.created_at >= a.created_at
   AND b.created_at <= a.created_at + INTERVAL '10 minutes'
)
SELECT *
FROM paired
ORDER BY created_at_1 DESC, seconds_apart ASC;

-- 2) Net paid vs refunded per member/case (shows over-refunds where net_remaining < 0).
WITH net_by_member_case AS (
  SELECT
    t.member_id,
    t.case_id,
    SUM(
      CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(COALESCE(t.amount, 0))
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(COALESCE(t.amount, 0))
        ELSE 0
      END
    )::NUMERIC(15,2) AS net_remaining,
    SUM(CASE WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(COALESCE(t.amount, 0)) ELSE 0 END)::NUMERIC(15,2) AS total_paid,
    SUM(CASE WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN ABS(COALESCE(t.amount, 0)) ELSE 0 END)::NUMERIC(15,2) AS total_refunded
  FROM public.transactions t
  WHERE COALESCE(t.status, 'completed') = 'completed'
    AND t.member_id IS NOT NULL
    AND t.case_id IS NOT NULL
    AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'contribution_refund', 'case_wallet_refund')
  GROUP BY t.member_id, t.case_id
)
SELECT
  n.member_id,
  n.case_id,
  m.member_number,
  m.name,
  c.case_number,
  n.total_paid,
  n.total_refunded,
  n.net_remaining
FROM net_by_member_case n
JOIN public.members m ON m.id = n.member_id
JOIN public.cases c ON c.id = n.case_id
WHERE n.net_remaining < -0.009
ORDER BY n.net_remaining ASC, m.member_number, c.case_number;
