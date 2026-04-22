-- Fix wallet inconsistency: case contributions should not debit wallet.
-- Wallet debits are only explicit debit types (registration/renewal/penalty/arrears/case_wallet_deduction).

CREATE OR REPLACE FUNCTION update_member_wallet_balance_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_member_id UUID;
    v_new_balance DECIMAL(15,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_member_id := OLD.member_id;
    ELSE
        v_member_id := NEW.member_id;
    END IF;

    SELECT COALESCE(SUM(
        CASE
            WHEN transaction_type IN (
                'registration',
                'renewal',
                'penalty',
                'arrears',
                'case_wallet_deduction'
            ) THEN -ABS(amount)
            WHEN transaction_type = 'reversal_memo' THEN 0
            ELSE amount
        END
    ), 0) INTO v_new_balance
    FROM transactions
    WHERE member_id = v_member_id
      AND COALESCE(status, 'completed') = 'completed';

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

COMMENT ON FUNCTION update_member_wallet_balance_trigger() IS
'Sets members.wallet_balance from completed transactions only. contribution rows are case ledger records and do not change wallet; case_wallet_deduction debits wallet.';

CREATE OR REPLACE FUNCTION calculate_wallet_balance(p_member_id UUID)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    balance DECIMAL(15,2);
BEGIN
    SELECT COALESCE(SUM(
        CASE
            WHEN transaction_type IN (
                'registration',
                'renewal',
                'penalty',
                'arrears',
                'case_wallet_deduction'
            ) THEN -ABS(amount)
            WHEN transaction_type = 'reversal_memo' THEN 0
            ELSE amount
        END
    ), 0) INTO balance
    FROM transactions
    WHERE member_id = p_member_id
      AND COALESCE(status, 'completed') = 'completed';

    RETURN balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_wallet_balance(UUID) IS
'Ledger-aligned wallet total (completed rows only). contribution rows are non-wallet case payments.';

-- Recompute stored balances with corrected formula.
UPDATE members m
SET wallet_balance = calculate_wallet_balance(m.id)
WHERE m.id IS NOT NULL;
