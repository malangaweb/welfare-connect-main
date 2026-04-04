-- =====================================================
-- MIGRATION: Fix Failed + Duplicate M-Pesa Inserts
-- Date: 2026-04-02
-- Purpose:
-- 1) Ensure suspense insert shape can't fail on phone hashes
-- 2) Archive + remove duplicate transactions by mpesa_reference
-- 3) Enforce uniqueness for future mpesa_reference inserts
-- =====================================================

-- 0) Keep suspense schema tolerant for hashed/unknown MSISDN
ALTER TABLE wrong_mpesa_transactions
  ALTER COLUMN phone_number TYPE VARCHAR(255),
  ALTER COLUMN phone_number DROP NOT NULL;

ALTER TABLE wrong_mpesa_transactions
  DROP CONSTRAINT IF EXISTS wrong_mpesa_transactions_phone_not_blank;

ALTER TABLE wrong_mpesa_transactions
  DROP CONSTRAINT IF EXISTS wrong_mpesa_transactions_receipt_not_blank;

-- 1) Archive duplicate transaction rows before cleanup
CREATE TABLE IF NOT EXISTS public.transactions_duplicate_archive (
  id UUID PRIMARY KEY,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archive_reason TEXT NOT NULL,
  original_row JSONB NOT NULL
);

WITH ranked AS (
  SELECT
    t.*,
    ROW_NUMBER() OVER (
      PARTITION BY t.mpesa_reference
      ORDER BY t.created_at ASC, t.id ASC
    ) AS rn
  FROM public.transactions t
  WHERE t.mpesa_reference IS NOT NULL
)
INSERT INTO public.transactions_duplicate_archive (id, archived_at, archive_reason, original_row)
SELECT
  r.id,
  NOW(),
  'Duplicate mpesa_reference cleanup',
  to_jsonb(r) - 'rn'
FROM ranked r
WHERE r.rn > 1
ON CONFLICT (id) DO NOTHING;

-- 2) Remove duplicate rows from transactions, keep earliest row per mpesa_reference
WITH ranked AS (
  SELECT
    t.id,
    ROW_NUMBER() OVER (
      PARTITION BY t.mpesa_reference
      ORDER BY t.created_at ASC, t.id ASC
    ) AS rn
  FROM public.transactions t
  WHERE t.mpesa_reference IS NOT NULL
)
DELETE FROM public.transactions t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- 3) Enforce uniqueness going forward
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_mpesa_reference
  ON public.transactions (mpesa_reference)
  WHERE mpesa_reference IS NOT NULL;

-- 4) Recalculate wallet balances after dedupe (if function exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'calculate_wallet_balance'
      AND n.nspname = 'public'
  ) THEN
    UPDATE public.members m
    SET wallet_balance = public.calculate_wallet_balance(m.id)
    WHERE m.id IS NOT NULL;
  END IF;
END $$;

-- 5) Visibility checks
-- SELECT COUNT(*) FROM transactions_duplicate_archive;
-- SELECT mpesa_reference, COUNT(*) FROM transactions WHERE mpesa_reference IS NOT NULL GROUP BY mpesa_reference HAVING COUNT(*) > 1;
