-- =====================================================
-- MIGRATION: Add update_wallet_balance helper
-- Date: 2026-04-02
-- Purpose: Provide RPC used by auto-match and webhooks
-- =====================================================

-- Drop and recreate to be idempotent
DROP FUNCTION IF EXISTS update_wallet_balance(UUID, numeric, text);

CREATE OR REPLACE FUNCTION update_wallet_balance(
    p_member_id UUID,
    p_amount    NUMERIC,
    p_action    TEXT DEFAULT 'deposit'
) RETURNS DECIMAL(15,2) AS $$
DECLARE
    v_new_balance DECIMAL(15,2);
BEGIN
    IF p_member_id IS NULL THEN
        RAISE EXCEPTION 'update_wallet_balance called with null member id';
    END IF;

    IF p_action ILIKE 'withdraw' OR p_action ILIKE 'debit' THEN
        UPDATE members
        SET wallet_balance = COALESCE(wallet_balance, 0) - ABS(p_amount)
        WHERE id = p_member_id
        RETURNING wallet_balance INTO v_new_balance;
    ELSE
        UPDATE members
        SET wallet_balance = COALESCE(wallet_balance, 0) + ABS(p_amount)
        WHERE id = p_member_id
        RETURNING wallet_balance INTO v_new_balance;
    END IF;

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_wallet_balance(UUID, numeric, text) IS 'Adjusts member wallet_balance by amount; p_action: deposit (default) or withdraw/debit.';

GRANT EXECUTE ON FUNCTION update_wallet_balance(UUID, numeric, text) TO authenticated;
