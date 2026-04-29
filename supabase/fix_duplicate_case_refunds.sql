-- Auto-repair over-refunded case contributions.
-- This script finds member/case pairs where refunds exceed paid amount,
-- then reverses the newest completed refund rows enough to eliminate negative net.

BEGIN;

CREATE TEMP TABLE _target_refund_tx_ids (id uuid PRIMARY KEY, member_id uuid, case_id uuid) ON COMMIT DROP;

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
    )::NUMERIC(15,2) AS net_remaining
  FROM public.transactions t
  WHERE COALESCE(t.status, 'completed') = 'completed'
    AND t.member_id IS NOT NULL
    AND t.case_id IS NOT NULL
    AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'contribution_refund', 'case_wallet_refund')
  GROUP BY t.member_id, t.case_id
),
over_refunded AS (
  SELECT
    n.member_id,
    n.case_id,
    ABS(n.net_remaining)::NUMERIC(15,2) AS over_refund_amount
  FROM net_by_member_case n
  WHERE n.net_remaining < -0.009
),
refund_candidates AS (
  SELECT
    t.id,
    t.member_id,
    t.case_id,
    ABS(COALESCE(t.amount, 0))::NUMERIC(15,2) AS refund_amount,
    t.created_at,
    o.over_refund_amount,
    SUM(ABS(COALESCE(t.amount, 0))::NUMERIC(15,2)) OVER (
      PARTITION BY t.member_id, t.case_id
      ORDER BY t.created_at DESC, t.id DESC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_refund_from_latest
  FROM public.transactions t
  JOIN over_refunded o
    ON o.member_id = t.member_id
   AND o.case_id = t.case_id
  WHERE t.transaction_type IN ('contribution_refund', 'case_wallet_refund')
    AND COALESCE(t.status, 'completed') = 'completed'
),
target_tx AS (
  SELECT DISTINCT id, member_id, case_id
  FROM refund_candidates
  WHERE running_refund_from_latest - refund_amount < over_refund_amount + 0.009
)
INSERT INTO _target_refund_tx_ids (id, member_id, case_id)
SELECT id, member_id, case_id
FROM target_tx;

WITH updated AS (
  UPDATE public.transactions t
  SET status = 'reversed',
      metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
        'repair_action', 'auto_over_refund_reversal',
        'repaired_at', NOW()
      )
  FROM _target_refund_tx_ids x
  WHERE t.id = x.id
  RETURNING t.id
)
SELECT COUNT(*) AS reversed_refund_rows FROM updated;

-- Recompute wallet balances for affected members.
UPDATE public.members m
SET wallet_balance = public.calculate_wallet_balance(m.id)
WHERE m.id IN (SELECT DISTINCT member_id FROM _target_refund_tx_ids WHERE member_id IS NOT NULL);

-- Recompute case actual_amount for affected cases.
WITH case_totals AS (
  SELECT
    t.case_id,
    GREATEST(
      0,
      COALESCE(SUM(CASE WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(t.amount) ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN ABS(t.amount) ELSE 0 END), 0)
    )::NUMERIC(15,2) AS actual_amount
  FROM public.transactions t
  WHERE t.case_id IN (SELECT DISTINCT case_id FROM _target_refund_tx_ids WHERE case_id IS NOT NULL)
    AND COALESCE(t.status, 'completed') = 'completed'
    AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'contribution_refund', 'case_wallet_refund')
  GROUP BY t.case_id
)
UPDATE public.cases c
SET actual_amount = ct.actual_amount
FROM case_totals ct
WHERE c.id = ct.case_id;

COMMIT;
