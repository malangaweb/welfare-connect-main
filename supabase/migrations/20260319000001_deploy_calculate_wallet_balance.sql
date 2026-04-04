-- =====================================================
-- DEPLOY CALCULATE_WALLET_BALANCE RPC FUNCTION
-- =====================================================
-- Run this SQL in your Supabase SQL Editor to ensure the function exists

-- Drop if exists (to recreate with latest version)
DROP FUNCTION IF EXISTS calculate_wallet_balance(UUID);

-- Create the function
CREATE OR REPLACE FUNCTION calculate_wallet_balance(p_member_id UUID)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    balance DECIMAL(15,2);
BEGIN
    SELECT COALESCE(SUM(
        CASE
            WHEN transaction_type IN ('registration', 'renewal', 'contribution', 'penalty', 'arrears') THEN -ABS(amount)
            ELSE amount
        END
    ), 0) INTO balance
    FROM transactions
    WHERE member_id = p_member_id;

    RETURN balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON FUNCTION calculate_wallet_balance(UUID) IS 
'Calculates member wallet balance by summing all transactions. 
Negative amounts: registration, renewal, contribution, penalty, arrears.
Positive amounts: wallet_funding, disbursement, contribution_refund, etc.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION calculate_wallet_balance(UUID) TO authenticated;

-- =====================================================
-- HELPER FUNCTION TO REFRESH ALL MEMBER BALANCES
-- =====================================================
-- This function updates all member wallet_balances at once

CREATE OR REPLACE FUNCTION refresh_all_member_wallet_balances()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE members m
    SET wallet_balance = calculate_wallet_balance(m.id)
    WHERE m.id IS NOT NULL;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION refresh_all_member_wallet_balances() TO authenticated;

-- =====================================================
-- TEST THE FUNCTION
-- =====================================================
-- Uncomment to test with a specific member ID:
-- SELECT calculate_wallet_balance('YOUR_MEMBER_ID_HERE');

-- =====================================================
-- UPDATE ALL MEMBER WALLET_BALANCES TO MATCH CALCULATED VALUES
-- =====================================================
-- This ensures the stored wallet_balance column matches the calculated value

UPDATE members m
SET wallet_balance = calculate_wallet_balance(m.id)
WHERE m.id IS NOT NULL;

-- Verify the update
SELECT 
    member_number, 
    name, 
    wallet_balance,
    calculate_wallet_balance(id) as calculated_balance
FROM members 
ORDER BY member_number 
LIMIT 10;
