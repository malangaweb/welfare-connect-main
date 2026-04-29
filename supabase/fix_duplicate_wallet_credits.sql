-- Safe repair for duplicate wallet credits.
-- Usage:
-- 1) Run check_possible_double_wallet_credits.sql and identify BAD duplicate tx ids.
-- 2) Paste ONLY the duplicate tx ids to reverse into target_tx_ids CTE below.
-- 3) Run this script.
--
-- Notes:
-- - This script marks listed rows as status='reversed' (it does NOT hard delete).
-- - Wallet balances are then recomputed from ledger via calculate_wallet_balance().
-- - It only touches completed wallet_funding rows to avoid accidental reversals.

BEGIN;

-- Replace sample rows with real duplicate transaction IDs.
WITH target_tx_ids AS (
  SELECT NULL::uuid AS id
  WHERE FALSE
  -- Paste rows like:
  -- UNION ALL SELECT '00000000-0000-0000-0000-000000000000'::uuid
), 
validated AS (
  SELECT t.id, t.member_id, t.amount, t.created_at, t.mpesa_reference, t.reference, t.status, t.transaction_type
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
  RETURNING t.id, t.member_id
)
SELECT * FROM updated;

-- Recompute wallet balances for affected members only.
WITH target_tx_ids AS (
  SELECT NULL::uuid AS id
  WHERE FALSE
  -- Paste rows like:
  -- UNION ALL SELECT '00000000-0000-0000-0000-000000000000'::uuid
),
affected_members AS (
  SELECT DISTINCT t.member_id
  FROM public.transactions t
  JOIN target_tx_ids x ON x.id = t.id
  WHERE t.member_id IS NOT NULL
)
UPDATE public.members m
SET wallet_balance = public.calculate_wallet_balance(m.id)
FROM affected_members a
WHERE m.id = a.member_id;

COMMIT;

-- Verification: run after commit.
-- SELECT id, member_number, name, wallet_balance, calculate_wallet_balance(id) AS computed
-- FROM public.members
-- WHERE id IN (
--   SELECT DISTINCT member_id
--   FROM public.transactions
--   WHERE id IN (
--     '00000000-0000-0000-0000-000000000000'::uuid
--   )
-- );
