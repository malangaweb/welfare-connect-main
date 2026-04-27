-- Harden M-Pesa idempotency to prevent wallet double-credit on callback retries/format drift.
-- 1) Normalize existing mpesa_reference values (trim, strip spaces, uppercase)
-- 2) Archive+dedupe rows that collide after normalization
-- 3) Enforce uniqueness on normalized receipt value
-- 4) Normalize receipt fields on every insert/update

UPDATE public.transactions
SET mpesa_reference = UPPER(REGEXP_REPLACE(BTRIM(mpesa_reference), '[[:space:]]+', '', 'g'))
WHERE mpesa_reference IS NOT NULL
  AND mpesa_reference <> UPPER(REGEXP_REPLACE(BTRIM(mpesa_reference), '[[:space:]]+', '', 'g'));

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
      PARTITION BY UPPER(REGEXP_REPLACE(BTRIM(t.mpesa_reference), '[[:space:]]+', '', 'g'))
      ORDER BY t.created_at ASC, t.id ASC
    ) AS rn
  FROM public.transactions t
  WHERE t.mpesa_reference IS NOT NULL
    AND BTRIM(t.mpesa_reference) <> ''
)
INSERT INTO public.transactions_duplicate_archive (id, archived_at, archive_reason, original_row)
SELECT
  r.id,
  NOW(),
  'Duplicate normalized mpesa_reference cleanup',
  to_jsonb(r) - 'rn'
FROM ranked r
WHERE r.rn > 1
ON CONFLICT (id) DO NOTHING;

WITH ranked AS (
  SELECT
    t.id,
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(REGEXP_REPLACE(BTRIM(t.mpesa_reference), '[[:space:]]+', '', 'g'))
      ORDER BY t.created_at ASC, t.id ASC
    ) AS rn
  FROM public.transactions t
  WHERE t.mpesa_reference IS NOT NULL
    AND BTRIM(t.mpesa_reference) <> ''
)
DELETE FROM public.transactions t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;

DROP INDEX IF EXISTS public.uq_transactions_mpesa_reference;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_mpesa_reference_normalized
  ON public.transactions ((UPPER(REGEXP_REPLACE(BTRIM(mpesa_reference), '[[:space:]]+', '', 'g'))))
  WHERE mpesa_reference IS NOT NULL
    AND BTRIM(mpesa_reference) <> '';

CREATE OR REPLACE FUNCTION normalize_transaction_reference_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mpesa_reference IS NOT NULL THEN
    NEW.mpesa_reference := UPPER(REGEXP_REPLACE(BTRIM(NEW.mpesa_reference), '[[:space:]]+', '', 'g'));
    IF NEW.mpesa_reference = '' THEN
      NEW.mpesa_reference := NULL;
    END IF;
  END IF;

  IF NEW.reference IS NOT NULL THEN
    NEW.reference := BTRIM(NEW.reference);
    IF NEW.reference = '' THEN
      NEW.reference := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_transaction_reference_fields ON public.transactions;
CREATE TRIGGER trg_normalize_transaction_reference_fields
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION normalize_transaction_reference_fields();

COMMENT ON FUNCTION normalize_transaction_reference_fields() IS
'Normalizes transactions.mpesa_reference/reference (trim/uppercase/space-stripped) to enforce idempotent M-Pesa inserts.';

UPDATE public.members m
SET wallet_balance = public.calculate_wallet_balance(m.id)
WHERE m.id IS NOT NULL;
