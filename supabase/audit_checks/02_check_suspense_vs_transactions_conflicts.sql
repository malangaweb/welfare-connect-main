-- Check 2: Receipt appears in transactions and still unresolved in suspense
-- Goal: catch receipts that should likely have been reconciled

WITH tx_refs AS (
  SELECT DISTINCT
    UPPER(REGEXP_REPLACE(COALESCE(mpesa_reference, ''), '\\s+', '', 'g')) AS mpesa_ref_norm
  FROM transactions
  WHERE COALESCE(mpesa_reference, '') <> ''
), suspense_unresolved AS (
  SELECT
    id,
    created_at,
    transaction_date,
    amount,
    phone_number,
    status,
    reference,
    mpesa_receipt_number,
    UPPER(REGEXP_REPLACE(COALESCE(mpesa_receipt_number, ''), '\\s+', '', 'g')) AS receipt_norm
  FROM wrong_mpesa_transactions
  WHERE status IN ('pending', 'PENDING_REVIEW')
)
SELECT
  s.id,
  s.created_at,
  s.transaction_date,
  s.amount,
  s.phone_number,
  s.status,
  s.reference,
  s.mpesa_receipt_number
FROM suspense_unresolved s
JOIN tx_refs t ON t.mpesa_ref_norm = s.receipt_norm
WHERE s.receipt_norm <> ''
ORDER BY COALESCE(s.transaction_date, s.created_at) DESC;
