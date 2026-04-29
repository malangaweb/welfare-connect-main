-- Forensics: possible duplicate wallet credits already posted.
-- Focus: completed wallet_funding rows, same member + same amount close in time.

WITH wf AS (
  SELECT
    t.id,
    t.member_id,
    m.member_number,
    m.name,
    ABS(COALESCE(t.amount, 0))::NUMERIC(15,2) AS amount_abs,
    t.created_at,
    t.mpesa_reference,
    t.reference,
    t.description
  FROM public.transactions t
  JOIN public.members m ON m.id = t.member_id
  WHERE t.transaction_type = 'wallet_funding'
    AND COALESCE(t.status, 'completed') = 'completed'
), paired AS (
  SELECT
    a.member_id,
    a.member_number,
    a.name,
    a.amount_abs,
    a.id AS tx_id_1,
    b.id AS tx_id_2,
    a.created_at AS created_at_1,
    b.created_at AS created_at_2,
    a.mpesa_reference AS mpesa_ref_1,
    b.mpesa_reference AS mpesa_ref_2,
    a.reference AS reference_1,
    b.reference AS reference_2,
    EXTRACT(EPOCH FROM (b.created_at - a.created_at))::INT AS seconds_apart
  FROM wf a
  JOIN wf b
    ON a.member_id = b.member_id
   AND a.amount_abs = b.amount_abs
   AND a.id < b.id
   AND b.created_at >= a.created_at
   AND b.created_at <= a.created_at + INTERVAL '30 minutes'
)
SELECT *
FROM paired
ORDER BY created_at_1 DESC, seconds_apart ASC;
