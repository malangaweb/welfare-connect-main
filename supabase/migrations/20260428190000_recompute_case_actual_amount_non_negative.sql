-- Recompute cases.actual_amount from completed contribution/refund ledger,
-- and clamp to zero so case totals never show negative.

WITH case_net AS (
  SELECT
    c.id AS case_id,
    GREATEST(
      0,
      COALESCE(SUM(
        CASE
          WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction')
            THEN ABS(COALESCE(t.amount, 0))
          WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund')
            THEN -GREATEST(COALESCE(t.amount, 0), 0)
          ELSE 0
        END
      ) FILTER (WHERE COALESCE(t.status, 'completed') = 'completed'), 0)
    )::NUMERIC AS net_amount
  FROM public.cases c
  LEFT JOIN public.transactions t
    ON t.case_id = c.id
   AND t.transaction_type IN (
     'contribution',
     'case_wallet_deduction',
     'contribution_refund',
     'case_wallet_refund'
   )
  GROUP BY c.id
)
UPDATE public.cases c
SET actual_amount = n.net_amount
FROM case_net n
WHERE c.id = n.case_id;
