-- Auto-generated from strict classifier run on 2026-04-28.
-- Group 1 (likely true accidental duplicates): NONE.
-- This script is intentionally a no-op.

BEGIN;

WITH target_tx_ids AS (
  SELECT NULL::uuid AS id
  WHERE FALSE
),
validated AS (
  SELECT t.id
  FROM public.transactions t
  JOIN target_tx_ids x ON x.id = t.id
  WHERE t.transaction_type = 'wallet_funding'
    AND COALESCE(t.status, 'completed') = 'completed'
),
updated AS (
  UPDATE public.transactions t
  SET status = 'reversed',
      metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
        'repair_action', 'duplicate_wallet_credit_reversal',
        'repaired_at', NOW()
      )
  FROM validated v
  WHERE t.id = v.id
  RETURNING t.id
)
SELECT COUNT(*) AS reversed_rows
FROM updated;

COMMIT;
