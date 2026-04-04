-- =====================================================
-- MIGRATION: Add Case Reference Support for C2B Payments
-- Date: 2026-03-31
-- Purpose: Enable compound reference parsing (Member#Case)
--          so members can pay directly for cases via M-Pesa
-- =====================================================

-- 1. Add intended_case_id to wrong_mpesa_transactions
ALTER TABLE wrong_mpesa_transactions 
  ADD COLUMN IF NOT EXISTS intended_case_id UUID REFERENCES cases(id) ON DELETE SET NULL;

-- 2. Add intended_member_id to wrong_mpesa_transactions
--    This stores the member the payment was intended for (may differ from matched_member_id)
ALTER TABLE wrong_mpesa_transactions 
  ADD COLUMN IF NOT EXISTS intended_member_id UUID REFERENCES members(id) ON DELETE SET NULL;

-- 3. Add reference_type to distinguish payment intent
ALTER TABLE wrong_mpesa_transactions 
  ADD COLUMN IF NOT EXISTS reference_type VARCHAR(30) 
  CHECK (reference_type IN ('member_only', 'case_only', 'member_and_case', 'phone_and_member', 'unknown'));

-- 4. Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_case ON wrong_mpesa_transactions(intended_case_id);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_intended_member ON wrong_mpesa_transactions(intended_member_id);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_reference_type ON wrong_mpesa_transactions(reference_type);

-- 5. Add helpful comments
COMMENT ON COLUMN wrong_mpesa_transactions.intended_case_id IS 'The case the payer intended to pay for (parsed from BillRefNumber)';
COMMENT ON COLUMN wrong_mpesa_transactions.intended_member_id IS 'The member the payment was intended for (parsed from BillRefNumber, may differ from matched_member_id)';
COMMENT ON COLUMN wrong_mpesa_transactions.reference_type IS 'Type of reference parsed: member_only, case_only, member_and_case, phone_and_member, unknown';
