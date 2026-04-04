-- =====================================================
-- FINANCIAL SUMMARY RPC FUNCTION
-- Returns pool balances for the Reports page
-- =====================================================

CREATE OR REPLACE FUNCTION get_financial_summary()
RETURNS TABLE (
  registration_pool_balance NUMERIC,
  renewal_pool_balance NUMERIC,
  case_pool_balance NUMERIC,
  suspense_account_balance NUMERIC,
  total_liquidity NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Registration pool from accounts table
    COALESCE((SELECT SUM(balance) FROM accounts WHERE type = 'registration'), 0) AS registration_pool_balance,
    -- Renewal pool from accounts table  
    COALESCE((SELECT SUM(balance) FROM accounts WHERE type = 'renewal'), 0) AS renewal_pool_balance,
    -- Case pool from accounts table (if type exists) or sum of case contributions
    COALESCE((SELECT SUM(balance) FROM accounts WHERE type = 'case'), 
             (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE transaction_type = 'contribution' AND status = 'completed')) AS case_pool_balance,
    -- Suspense account from wrong_mpesa_transactions
    COALESCE((SELECT SUM(amount) FROM wrong_mpesa_transactions WHERE status = 'pending'), 0) AS suspense_account_balance,
    -- Total liquidity
    (
      COALESCE((SELECT SUM(balance) FROM accounts WHERE type = 'registration'), 0) +
      COALESCE((SELECT SUM(balance) FROM accounts WHERE type = 'renewal'), 0) +
      COALESCE((SELECT SUM(balance) FROM accounts WHERE type = 'case'), 0) +
      COALESCE((SELECT SUM(amount) FROM wrong_mpesa_transactions WHERE status = 'pending'), 0)
    ) AS total_liquidity;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_financial_summary() TO authenticated;

COMMENT ON FUNCTION get_financial_summary() IS 'Returns pool balances for financial reports: registration, renewal, case pools and suspense account';
