-- Hardening: single helper for wallet effect + drift check view/query.

CREATE OR REPLACE FUNCTION transaction_wallet_effect(
  p_transaction_type TEXT,
  p_amount NUMERIC,
  p_status TEXT DEFAULT 'completed'
)
RETURNS NUMERIC AS $$
BEGIN
  -- Only completed rows affect wallet.
  IF COALESCE(p_status, 'completed') <> 'completed' THEN
    RETURN 0;
  END IF;

  -- Audit-only reversal rows have no wallet effect.
  IF p_transaction_type = 'reversal_memo' THEN
    RETURN 0;
  END IF;

  -- Explicit wallet debits.
  IF p_transaction_type IN ('registration', 'renewal', 'penalty', 'arrears', 'case_wallet_deduction') THEN
    RETURN -ABS(COALESCE(p_amount, 0));
  END IF;

  -- Everything else credits wallet (e.g. wallet_funding, contribution_refund, disbursement, contribution).
  RETURN COALESCE(p_amount, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION transaction_wallet_effect(TEXT, NUMERIC, TEXT) IS
'Canonical wallet impact formula per transaction row. Completed-only, reversal_memo=0, explicit debit types negative, others positive.';

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

    SELECT COALESCE(SUM(transaction_wallet_effect(transaction_type, amount, status)), 0)
      INTO v_new_balance
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

CREATE OR REPLACE FUNCTION calculate_wallet_balance(p_member_id UUID)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    balance DECIMAL(15,2);
BEGIN
    SELECT COALESCE(SUM(transaction_wallet_effect(transaction_type, amount, status)), 0)
      INTO balance
    FROM transactions
    WHERE member_id = p_member_id;

    RETURN balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drift view for audits/monitoring.
CREATE OR REPLACE VIEW member_wallet_balance_drift AS
SELECT
  m.id AS member_id,
  m.member_number,
  m.name,
  COALESCE(m.wallet_balance, 0)::NUMERIC(15,2) AS stored_wallet_balance,
  COALESCE(SUM(transaction_wallet_effect(t.transaction_type, t.amount, t.status)), 0)::NUMERIC(15,2) AS computed_wallet_balance,
  (COALESCE(m.wallet_balance, 0) - COALESCE(SUM(transaction_wallet_effect(t.transaction_type, t.amount, t.status)), 0))::NUMERIC(15,2) AS drift
FROM members m
LEFT JOIN transactions t ON t.member_id = m.id
GROUP BY m.id, m.member_number, m.name, m.wallet_balance;

COMMENT ON VIEW member_wallet_balance_drift IS
'Shows stored vs computed wallet balance per member and drift amount (stored - computed).';

-- Recompute all balances with canonical helper.
UPDATE members m
SET wallet_balance = calculate_wallet_balance(m.id)
WHERE m.id IS NOT NULL;
