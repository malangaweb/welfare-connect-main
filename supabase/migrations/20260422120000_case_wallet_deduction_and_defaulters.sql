-- Case wallet deductions (treasurer bulk workflow), idempotency, and case-close defaulter records

-- 1) Wallet balance trigger: treat case_wallet_deduction like other wallet debits
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
                'contribution',
                'penalty',
                'arrears',
                'case_wallet_deduction'
            ) THEN -ABS(amount)
            ELSE amount
        END
    ), 0) INTO v_new_balance
    FROM transactions
    WHERE member_id = v_member_id;

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
'Updates member wallet_balance from transactions. case_wallet_deduction debits the wallet like contribution fees.';

-- 2) Refresh balances to stay consistent with the updated rule
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
)
WHERE m.id IS NOT NULL;

-- 3) At most one bulk wallet deduction per member per case (retry-safe)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_case_wallet_deduction_idempotent
ON transactions (member_id, case_id)
WHERE transaction_type = 'case_wallet_deduction';

-- 4) Defaulters recorded when a case is finalized (paid = contribution or case_wallet_deduction)
CREATE TABLE IF NOT EXISTS case_defaulters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (case_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_case_defaulters_member_id ON case_defaulters(member_id);
CREATE INDEX IF NOT EXISTS idx_case_defaulters_case_id ON case_defaulters(case_id);

CREATE OR REPLACE FUNCTION record_case_defaulters_on_finalize()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_finalized IS TRUE AND COALESCE(OLD.is_finalized, FALSE) IS DISTINCT FROM TRUE THEN
        INSERT INTO case_defaulters (case_id, member_id)
        SELECT NEW.id, m.id
        FROM members m
        WHERE m.is_active = true
          AND m.status IN ('active', 'probation')
          AND NOT EXISTS (
            SELECT 1
            FROM transactions t
            WHERE t.member_id = m.id
              AND t.case_id = NEW.id
              AND t.transaction_type IN ('contribution', 'case_wallet_deduction')
              AND COALESCE(t.status, 'completed') = 'completed'
          )
        ON CONFLICT (case_id, member_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_cases_record_defaulters ON cases;
CREATE TRIGGER tr_cases_record_defaulters
    AFTER UPDATE OF is_finalized ON cases
    FOR EACH ROW
    EXECUTE FUNCTION record_case_defaulters_on_finalize();

COMMENT ON TABLE case_defaulters IS 'Members who had not paid toward a case when it was finalized (audit trail).';
