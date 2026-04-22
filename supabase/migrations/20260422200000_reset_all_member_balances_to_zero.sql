-- =============================================================================
-- DESTRUCTIVE: Reset all member wallet balances to zero
-- =============================================================================
-- This deletes ALL rows in public.transactions, then sets members.wallet_balance
-- to 0. Wallet totals are derived from transactions via a trigger; clearing
-- transactions is required or balances would recompute on the next tx change.
--
-- Also zeros cases.actual_amount so case cards do not show stale collection totals.
--
-- BACK UP YOUR DATABASE BEFORE APPLYING.
-- =============================================================================

ALTER TABLE transactions DISABLE TRIGGER update_member_wallet_on_transaction_change;

DELETE FROM transactions;

UPDATE members
SET wallet_balance = 0
WHERE id IS NOT NULL;

UPDATE cases
SET actual_amount = 0
WHERE id IS NOT NULL;

ALTER TABLE transactions ENABLE TRIGGER update_member_wallet_on_transaction_change;

-- Optional sanity: recompute from empty ledger (should already be 0)
UPDATE members m
SET wallet_balance = (
    SELECT COALESCE(SUM(
        CASE
            WHEN t.transaction_type IN (
                'registration',
                'renewal',
                'contribution',
                'penalty',
                'arrears',
                'case_wallet_deduction'
            ) THEN -ABS(t.amount)
            ELSE t.amount
        END
    ), 0)
    FROM transactions t
    WHERE t.member_id = m.id
);
