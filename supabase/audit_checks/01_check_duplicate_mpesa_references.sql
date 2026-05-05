-- Check 1: Duplicate M-Pesa references in transactions
-- Goal: identify potential double-posts by mpesa_reference

WITH normalized AS (
  SELECT
    id,
    created_at,
    member_id,
    amount,
    status,
    transaction_type,
    UPPER(REGEXP_REPLACE(COALESCE(mpesa_reference, ''), '\\s+', '', 'g')) AS mpesa_ref_norm
  FROM transactions
), dup_groups AS (
  SELECT
    mpesa_ref_norm,
    COUNT(*) AS row_count,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen
  FROM normalized
  WHERE mpesa_ref_norm <> ''
  GROUP BY mpesa_ref_norm
  HAVING COUNT(*) > 1
)
SELECT
  d.mpesa_ref_norm,
  d.row_count,
  d.first_seen,
  d.last_seen,
  n.id,
  n.created_at,
  n.member_id,
  n.transaction_type,
  n.status,
  n.amount
FROM dup_groups d
JOIN normalized n ON n.mpesa_ref_norm = d.mpesa_ref_norm
ORDER BY d.last_seen DESC, d.mpesa_ref_norm, n.created_at;
