-- =====================================================
-- MIGRATION: Fix Wallet Balance Updates
-- Date: 2026-03-31
-- Purpose: Auto-update member wallet_balance when transactions are inserted/updated/deleted
--          This ensures wallet_balance is always consistent with transactions
-- =====================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_member_wallet_on_transaction_change ON transactions;
DROP FUNCTION IF EXISTS update_member_wallet_balance_trigger();

-- Create trigger function to update member wallet balance
CREATE OR REPLACE FUNCTION update_member_wallet_balance_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_member_id UUID;
    v_new_balance DECIMAL(15,2);
BEGIN
    -- Determine which member to update
    IF TG_OP = 'DELETE' THEN
        v_member_id := OLD.member_id;
    ELSE
        v_member_id := NEW.member_id;
    END IF;

    -- Calculate new balance from all transactions for this member
    SELECT COALESCE(SUM(
        CASE
            WHEN transaction_type IN ('registration', 'renewal', 'contribution', 'penalty', 'arrears') THEN -ABS(amount)
            ELSE amount
        END
    ), 0) INTO v_new_balance
    FROM transactions
    WHERE member_id = v_member_id;

    -- Update member's wallet_balance
    UPDATE members
    SET wallet_balance = v_new_balance
    WHERE id = v_member_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on transactions table
CREATE TRIGGER update_member_wallet_on_transaction_change
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_member_wallet_balance_trigger();

-- Add comment for documentation
COMMENT ON FUNCTION update_member_wallet_balance_trigger() IS
'Automatically updates member wallet_balance when transactions are inserted, updated, or deleted.
Ensures wallet_balance is always consistent with transaction history.';

-- =====================================================
-- REFRESH ALL MEMBER WALLET BALANCES
-- =====================================================
-- Update all existing member wallet_balances to match calculated values
-- This ensures consistency for any past discrepancies

UPDATE members m
SET wallet_balance = (
    SELECT COALESCE(SUM(
        CASE
            WHEN t.transaction_type IN ('registration', 'renewal', 'contribution', 'penalty', 'arrears') THEN -ABS(t.amount)
            ELSE t.amount
        END
    ), 0)
    FROM transactions t
    WHERE t.member_id = m.id
)
WHERE m.id IS NOT NULL;

-- Log the refresh
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM members WHERE id IS NOT NULL;
    RAISE NOTICE 'Refreshed wallet balances for % members', v_count;
END $$;

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================
-- Run this to verify the fix worked:
-- SELECT member_number, name, wallet_balance, 
--        (SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('registration', 'renewal', 'contribution', 'penalty', 'arrears') THEN -ABS(amount) ELSE amount END), 0) 
--         FROM transactions WHERE member_id = m.id) as calculated_balance
-- FROM members m 
-- WHERE wallet_balance != (SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('registration', 'renewal', 'contribution', 'penalty', 'arrears') THEN -ABS(amount) ELSE amount END), 0) FROM transactions WHERE member_id = m.id)
-- LIMIT 10;
