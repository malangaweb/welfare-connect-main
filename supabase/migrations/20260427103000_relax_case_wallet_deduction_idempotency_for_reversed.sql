-- Allow member pay-to-case retry after an admin reversal.
-- Keep idempotency for active deductions only.

DROP INDEX IF EXISTS idx_transactions_case_wallet_deduction_idempotent;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_case_wallet_deduction_idempotent
ON transactions (member_id, case_id)
WHERE transaction_type = 'case_wallet_deduction'
  AND COALESCE(status, 'completed') <> 'reversed';

COMMENT ON INDEX idx_transactions_case_wallet_deduction_idempotent IS
'Enforces one active case_wallet_deduction per member/case; reversed rows do not block a new deduction.';
