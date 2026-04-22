-- Wallet drift audit
-- Usage: run in Supabase SQL editor or psql.

SELECT *
FROM member_wallet_balance_drift
WHERE ABS(drift) > 0.01
ORDER BY ABS(drift) DESC, member_number;

-- Quick summary
SELECT
  COUNT(*) FILTER (WHERE ABS(drift) > 0.01) AS members_with_drift,
  COALESCE(SUM(ABS(drift)) FILTER (WHERE ABS(drift) > 0.01), 0)::NUMERIC(15,2) AS total_absolute_drift
FROM member_wallet_balance_drift;
