-- =====================================================
-- MIGRATION: Harden Wrong M-Pesa Transactions
-- Date: 2026-03-21
-- Purpose: Quarantine corrupt suspense rows, enforce strict constraints,
--          and preserve the same core webhook context stored on transactions.
-- =====================================================

-- 1. Ensure the suspense table carries the same core payment context
ALTER TABLE wrong_mpesa_transactions
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'mpesa',
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS reference VARCHAR(255),
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Keep corrupt legacy rows for audit/backfill before tightening constraints
CREATE TABLE IF NOT EXISTS wrong_mpesa_transactions_quarantine (
    id UUID PRIMARY KEY,
    quarantined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    quarantine_reason TEXT NOT NULL,
    original_row JSONB NOT NULL
);

-- 3. Normalize current rows before validation
UPDATE wrong_mpesa_transactions
SET
    mpesa_receipt_number = NULLIF(BTRIM(mpesa_receipt_number), ''),
    phone_number = NULLIF(BTRIM(phone_number), ''),
    sender_name = NULLIF(BTRIM(sender_name), ''),
    status = COALESCE(NULLIF(BTRIM(status), ''), 'pending'),
    notes = NULLIF(BTRIM(notes), ''),
    payment_method = COALESCE(NULLIF(BTRIM(payment_method), ''), 'mpesa'),
    source = COALESCE(NULLIF(BTRIM(source), ''), 'unknown'),
    reference = NULLIF(BTRIM(reference), ''),
    metadata = COALESCE(metadata, '{}'::jsonb),
    transaction_date = COALESCE(transaction_date, created_at, NOW()),
    created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW());

-- 4. Backfill source hints for existing valid rows
UPDATE wrong_mpesa_transactions
SET source = CASE
    WHEN source <> 'unknown' THEN source
    WHEN COALESCE(notes, '') ILIKE '%stk%' THEN 'stk_push'
    WHEN COALESCE(notes, '') ILIKE '%c2b%' THEN 'c2b'
    ELSE 'legacy'
END;

-- 5. Quarantine rows that cannot satisfy the hardened constraints
INSERT INTO wrong_mpesa_transactions_quarantine (id, quarantined_at, quarantine_reason, original_row)
SELECT
    w.id,
    NOW(),
    CONCAT_WS(
        '; ',
        CASE WHEN w.mpesa_receipt_number IS NULL THEN 'missing receipt number' END,
        CASE WHEN w.phone_number IS NULL THEN 'missing phone number' END,
        CASE WHEN w.amount IS NULL THEN 'missing amount' END,
        CASE WHEN w.amount IS NOT NULL AND w.amount <= 0 THEN 'non-positive amount' END,
        CASE WHEN w.status IS NULL THEN 'missing status' END,
        CASE WHEN w.transaction_date IS NULL THEN 'missing transaction date' END
    ),
    to_jsonb(w)
FROM wrong_mpesa_transactions AS w
WHERE
    w.mpesa_receipt_number IS NULL
    OR w.phone_number IS NULL
    OR w.amount IS NULL
    OR w.amount <= 0
    OR w.status IS NULL
    OR w.transaction_date IS NULL
ON CONFLICT (id) DO UPDATE
SET
    quarantined_at = EXCLUDED.quarantined_at,
    quarantine_reason = EXCLUDED.quarantine_reason,
    original_row = EXCLUDED.original_row;

DELETE FROM wrong_mpesa_transactions
WHERE
    mpesa_receipt_number IS NULL
    OR phone_number IS NULL
    OR amount IS NULL
    OR amount <= 0
    OR status IS NULL
    OR transaction_date IS NULL;

-- 6. Add a row-normalization trigger so whitespace and null-ish inputs are cleaned
CREATE OR REPLACE FUNCTION normalize_wrong_mpesa_transaction_row()
RETURNS TRIGGER AS $$
BEGIN
    NEW.mpesa_receipt_number := NULLIF(BTRIM(NEW.mpesa_receipt_number), '');
    NEW.phone_number := NULLIF(BTRIM(NEW.phone_number), '');
    NEW.sender_name := NULLIF(BTRIM(NEW.sender_name), '');
    NEW.status := COALESCE(NULLIF(BTRIM(NEW.status), ''), 'pending');
    NEW.notes := NULLIF(BTRIM(NEW.notes), '');
    NEW.payment_method := COALESCE(NULLIF(BTRIM(NEW.payment_method), ''), 'mpesa');
    NEW.source := COALESCE(NULLIF(BTRIM(NEW.source), ''), 'unknown');
    NEW.reference := NULLIF(BTRIM(NEW.reference), '');
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
    NEW.transaction_date := COALESCE(NEW.transaction_date, NEW.created_at, NOW());
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := COALESCE(NEW.updated_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS normalize_wrong_mpesa_transaction_row ON wrong_mpesa_transactions;

CREATE TRIGGER normalize_wrong_mpesa_transaction_row
    BEFORE INSERT OR UPDATE ON wrong_mpesa_transactions
    FOR EACH ROW
    EXECUTE FUNCTION normalize_wrong_mpesa_transaction_row();

-- 7. Reapply defaults and strict nullability on the live table
ALTER TABLE wrong_mpesa_transactions
ALTER COLUMN mpesa_receipt_number SET NOT NULL,
ALTER COLUMN phone_number SET NOT NULL,
ALTER COLUMN amount SET NOT NULL,
ALTER COLUMN status SET DEFAULT 'pending',
ALTER COLUMN status SET NOT NULL,
ALTER COLUMN payment_method SET DEFAULT 'mpesa',
ALTER COLUMN payment_method SET NOT NULL,
ALTER COLUMN source SET DEFAULT 'unknown',
ALTER COLUMN source SET NOT NULL,
ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
ALTER COLUMN metadata SET NOT NULL,
ALTER COLUMN transaction_date SET DEFAULT NOW(),
ALTER COLUMN transaction_date SET NOT NULL,
ALTER COLUMN created_at SET DEFAULT NOW(),
ALTER COLUMN created_at SET NOT NULL,
ALTER COLUMN updated_at SET DEFAULT NOW(),
ALTER COLUMN updated_at SET NOT NULL;

-- 8. Replace weak constraints with explicit checks
ALTER TABLE wrong_mpesa_transactions
DROP CONSTRAINT IF EXISTS wrong_mpesa_transactions_receipt_not_blank,
DROP CONSTRAINT IF EXISTS wrong_mpesa_transactions_phone_not_blank,
DROP CONSTRAINT IF EXISTS wrong_mpesa_transactions_source_check,
DROP CONSTRAINT IF EXISTS wrong_mpesa_transactions_payment_method_check,
DROP CONSTRAINT IF EXISTS positive_amount,
DROP CONSTRAINT IF EXISTS "wrong_mpesa_transactions_status_check";

ALTER TABLE wrong_mpesa_transactions
ADD CONSTRAINT wrong_mpesa_transactions_receipt_not_blank
    CHECK (BTRIM(mpesa_receipt_number) <> ''),
ADD CONSTRAINT wrong_mpesa_transactions_phone_not_blank
    CHECK (BTRIM(phone_number) <> ''),
ADD CONSTRAINT wrong_mpesa_transactions_source_check
    CHECK (source IN ('c2b', 'stk_push', 'legacy', 'manual', 'unknown')),
ADD CONSTRAINT wrong_mpesa_transactions_payment_method_check
    CHECK (payment_method IN ('mpesa')),
ADD CONSTRAINT positive_amount
    CHECK (amount > 0),
ADD CONSTRAINT "wrong_mpesa_transactions_status_check"
    CHECK (status IN ('pending', 'matched', 'reversed', 'ignored', 'PENDING_REVIEW', 'RESOLVED'));

-- 9. Helpful indexes for reconciliation/debugging
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_source ON wrong_mpesa_transactions(source);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_reference ON wrong_mpesa_transactions(reference);

COMMENT ON TABLE wrong_mpesa_transactions IS 'Hardened suspense account for unmatched M-Pesa payments with strict data-quality checks and webhook context.';
COMMENT ON TABLE wrong_mpesa_transactions_quarantine IS 'Stores legacy/corrupt suspense rows removed before hardening constraints.';
COMMENT ON COLUMN wrong_mpesa_transactions.payment_method IS 'Payment rail used to receive the suspense payment.';
COMMENT ON COLUMN wrong_mpesa_transactions.source IS 'Webhook source that produced the suspense row.';
COMMENT ON COLUMN wrong_mpesa_transactions.reference IS 'Auxiliary webhook reference such as bill ref or checkout request id.';
COMMENT ON COLUMN wrong_mpesa_transactions.metadata IS 'Webhook context stored for reconciliation, mirroring transactions metadata.';
