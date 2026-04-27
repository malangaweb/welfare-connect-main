-- Fix regression: contribution rows must not credit wallets.
-- Case contributions are case-ledger records, while wallet changes happen via
-- wallet_funding/case_wallet_deduction/contribution_refund (as used in current flows).

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

  -- Case ledger payment rows do not directly affect wallet balance.
  IF p_transaction_type = 'contribution' THEN
    RETURN 0;
  END IF;

  -- Explicit wallet debits.
  IF p_transaction_type IN ('registration', 'renewal', 'penalty', 'arrears', 'case_wallet_deduction') THEN
    RETURN -ABS(COALESCE(p_amount, 0));
  END IF;

  -- Everything else credits wallet (e.g. wallet_funding, contribution_refund, disbursement).
  RETURN COALESCE(p_amount, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION transaction_wallet_effect(TEXT, NUMERIC, TEXT) IS
'Canonical wallet impact formula per transaction row. Completed-only, reversal_memo=0, contribution=0 (case ledger only), explicit debit types negative, others positive.';

-- Backfill: recompute and persist all member balances using corrected formula.
UPDATE members m
SET wallet_balance = calculate_wallet_balance(m.id)
WHERE m.id IS NOT NULL;
