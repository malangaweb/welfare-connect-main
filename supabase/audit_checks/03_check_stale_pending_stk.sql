-- Check 3: stale pending STK transactions
-- Goal: detect stuck STK rows that did not move to completed/failed/reversed
-- Default threshold: older than 30 minutes

SELECT
  id,
  created_at,
  member_id,
  amount,
  transaction_type,
  payment_method,
  status,
  reference,
  mpesa_reference,
  description,
  metadata
FROM transactions
WHERE status = 'pending'
  AND payment_method = 'mpesa'
  AND created_at < NOW() - INTERVAL '30 minutes'
ORDER BY created_at ASC;
