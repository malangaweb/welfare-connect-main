-- Allow member pay-to-case retry after an admin reversal.
-- Keep idempotency for active deductions only.

-- Drop legacy constraint variants that may still enforce full uniqueness.
ALTER TABLE IF EXISTS public.transactions
  DROP CONSTRAINT IF EXISTS transactions_member_id_case_id_key;

-- Drop any legacy unique index on (member_id, case_id), regardless of name.
DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN
    SELECT schemaname, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'transactions'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%ON public.transactions% (member_id, case_id)%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', idx.schemaname, idx.indexname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS idx_transactions_case_wallet_deduction_idempotent;

-- Backfill safety: if duplicates already exist, keep earliest active row and mark the rest reversed.
WITH ranked AS (
  SELECT
    t.id,
    ROW_NUMBER() OVER (
      PARTITION BY t.member_id, t.case_id
      ORDER BY t.created_at ASC, t.id ASC
    ) AS rn
  FROM public.transactions t
  WHERE t.transaction_type = 'case_wallet_deduction'
    AND COALESCE(t.status, 'completed') <> 'reversed'
    AND t.member_id IS NOT NULL
    AND t.case_id IS NOT NULL
),
to_reverse AS (
  SELECT id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.transactions t
SET
  status = 'reversed',
  metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'dedupe_reversed_at', to_jsonb(NOW()),
    'dedupe_reason', 'duplicate case_wallet_deduction before partial unique index'
  )
FROM to_reverse d
WHERE t.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_case_wallet_deduction_idempotent
ON transactions (member_id, case_id)
WHERE transaction_type = 'case_wallet_deduction'
  AND COALESCE(status, 'completed') <> 'reversed';

COMMENT ON INDEX idx_transactions_case_wallet_deduction_idempotent IS
'Enforces one active case_wallet_deduction per member/case; reversed rows do not block a new deduction.';
