-- =====================================================
-- MIGRATION: Final Database Views and Functions
-- Date: 2026-03-14
-- Purpose: Add database views for reporting and additional utility functions
-- =====================================================

-- Ensure metadata column exists on transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 1. ACTIVE DEFAULTERS VIEW
-- Shows members with negative balance who are still active
CREATE OR REPLACE VIEW active_defaulters AS
SELECT
  m.id,
  m.member_number,
  m.name,
  m.phone_number,
  m.email_address,
  m.status,
  m.wallet_balance,
  m.registration_date,
  m.probation_end_date,
  m.is_active,
  m.created_at
FROM members m
WHERE m.wallet_balance < 0
  AND m.is_active = true
  AND m.status NOT IN ('deceased', 'inactive')
ORDER BY m.wallet_balance ASC;

COMMENT ON VIEW active_defaulters IS 'Members with negative balance who are still active';

-- 2. MEMBERS ON PROBATION VIEW
-- Shows members currently on 90-day probation period
CREATE OR REPLACE VIEW members_on_probation AS
SELECT
  m.id,
  m.member_number,
  m.name,
  m.phone_number,
  m.email_address,
  m.residence,
  m.registration_date,
  m.probation_end_date,
  CURRENT_DATE - m.probation_end_date as days_overdue,
  m.wallet_balance,
  m.is_active
FROM members m
WHERE m.status = 'probation'
ORDER BY m.probation_end_date ASC;

COMMENT ON VIEW members_on_probation IS 'Members currently on 90-day probation period';

-- 3. MONTHLY CONTRIBUTIONS SUMMARY VIEW
CREATE OR REPLACE VIEW monthly_contributions_summary AS
SELECT
  DATE_TRUNC('month', t.created_at) as month,
  t.transaction_type,
  COUNT(*) as transaction_count,
  SUM(ABS(t.amount)) as total_amount,
  COUNT(DISTINCT t.member_id) as unique_members
FROM transactions t
WHERE t.status = 'completed'
  AND t.transaction_type IN ('contribution', 'registration', 'renewal', 'penalty', 'arrears')
GROUP BY DATE_TRUNC('month', t.created_at), t.transaction_type
ORDER BY month DESC, t.transaction_type;

COMMENT ON VIEW monthly_contributions_summary IS 'Monthly summary of contributions by type';

-- 4. CASE FUNDING SUMMARY VIEW
CREATE OR REPLACE VIEW case_funding_summary AS
SELECT
  c.id as case_id,
  c.case_number,
  c.case_type,
  c.affected_member_id,
  c.contribution_per_member,
  c.start_date,
  c.end_date,
  c.expected_amount,
  COALESCE(SUM(t.amount), 0) as actual_amount,
  COALESCE(SUM(t.amount), 0) - c.expected_amount as variance,
  c.is_active,
  c.is_finalized
FROM cases c
LEFT JOIN transactions t ON t.case_id = c.id AND t.status = 'completed'
GROUP BY c.id, c.case_number, c.case_type, c.affected_member_id, 
         c.contribution_per_member, c.start_date, c.end_date, 
         c.expected_amount, c.is_active, c.is_finalized
ORDER BY c.created_at DESC;

COMMENT ON VIEW case_funding_summary IS 'Summary of case funding progress';

-- 5. MEMBER TRANSACTION SUMMARY VIEW
CREATE OR REPLACE VIEW member_transaction_summary AS
SELECT
  m.id as member_id,
  m.member_number,
  m.name,
  m.phone_number,
  m.status,
  m.wallet_balance,
  COUNT(CASE WHEN t.transaction_type IN ('contribution', 'registration', 'renewal') THEN 1 END) as contributions_count,
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('contribution', 'registration', 'renewal') THEN ABS(t.amount) END), 0) as total_contributions,
  COUNT(CASE WHEN t.transaction_type = 'disbursement' THEN 1 END) as disbursements_count,
  COALESCE(SUM(CASE WHEN t.transaction_type = 'disbursement' THEN ABS(t.amount) END), 0) as total_disbursements,
  MAX(t.created_at) as last_transaction_date
FROM members m
LEFT JOIN transactions t ON t.member_id = m.id
GROUP BY m.id, m.member_number, m.name, m.phone_number, m.status, m.wallet_balance
ORDER BY m.member_number;

COMMENT ON VIEW member_transaction_summary IS 'Summary of member transaction activity';

-- 6. REVERSALS AUDIT VIEW
CREATE OR REPLACE VIEW reversals_audit AS
SELECT
  t.id as reversal_id,
  t.member_id,
  m.name as member_name,
  m.member_number,
  t.amount as reversal_amount,
  t.description,
  t.metadata->>'reversed_transaction_id' as original_transaction_id,
  t.metadata->>'reversal_reason' as reason,
  t.metadata->>'admin_id' as admin_id,
  t.created_at as reversal_date,
  orig.created_at as original_transaction_date,
  orig.amount as original_amount
FROM transactions t
LEFT JOIN members m ON m.id = t.member_id
LEFT JOIN transactions orig ON orig.id = (t.metadata->>'reversed_transaction_id')::uuid
WHERE t.status = 'reversed' OR t.metadata->>'reversed_transaction_id' IS NOT NULL
ORDER BY t.created_at DESC;

COMMENT ON VIEW reversals_audit IS 'Audit view of all transaction reversals';

-- 7. SUSPENSE ACCOUNT SUMMARY VIEW
CREATE OR REPLACE VIEW suspense_account_summary AS
SELECT
  status,
  COUNT(*) as transaction_count,
  SUM(amount) as total_amount,
  COUNT(DISTINCT phone_number) as unique_phones,
  MIN(transaction_date) as oldest_transaction,
  MAX(transaction_date) as newest_transaction
FROM wrong_mpesa_transactions
GROUP BY status
ORDER BY status;

COMMENT ON VIEW suspense_account_summary IS 'Summary of suspense account by status';

-- 8. FUNCTION: Get Member Probation Status
CREATE OR REPLACE FUNCTION get_member_probation_status(p_member_id UUID)
RETURNS TABLE (
  member_id UUID,
  member_number TEXT,
  name TEXT,
  status TEXT,
  registration_date DATE,
  probation_end_date DATE,
  days_remaining INT,
  is_probation_complete BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.member_number::TEXT,
    m.name::TEXT,
    m.status::TEXT,
    m.registration_date,
    m.probation_end_date,
    CASE
      WHEN m.probation_end_date IS NULL THEN NULL
      ELSE (m.probation_end_date - CURRENT_DATE)::INT
    END as days_remaining,
    CASE
      WHEN m.probation_end_date IS NULL THEN TRUE
      WHEN m.probation_end_date <= CURRENT_DATE THEN TRUE
      ELSE FALSE
    END as is_probation_complete
  FROM members m
  WHERE m.id = p_member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_member_probation_status IS 'Get probation status for a specific member';

-- 9. FUNCTION: Auto-Update Member Status Based on Probation
CREATE OR REPLACE FUNCTION auto_update_probation_status()
RETURNS INT AS $$
DECLARE
  v_updated_count INT := 0;
BEGIN
  UPDATE members
  SET 
    status = 'active',
    updated_at = NOW()
  WHERE 
    status = 'probation'
    AND probation_end_date <= CURRENT_DATE;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  -- Log the updates
  IF v_updated_count > 0 THEN
    INSERT INTO audit_logs (action, table_name, status, metadata)
    VALUES (
      'PROBATION_AUTO_UPDATE',
      'members',
      'success',
      jsonb_build_object(
        'updated_count', v_updated_count,
        'executed_at', NOW()
      )
    );
  END IF;
  
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_update_probation_status IS 'Auto-update members from probation to active status';

-- 10. FUNCTION: Get Dashboard Statistics (Enhanced)
CREATE OR REPLACE FUNCTION get_enhanced_dashboard_summary()
RETURNS TABLE (
  total_members BIGINT,
  active_members BIGINT,
  probation_members BIGINT,
  inactive_members BIGINT,
  deceased_members BIGINT,
  total_contributions NUMERIC,
  active_cases BIGINT,
  defaulters_count BIGINT,
  suspense_pending_count BIGINT,
  suspense_pending_amount NUMERIC,
  total_reversals_count BIGINT,
  total_reversals_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM members) as total_members,
    (SELECT COUNT(*) FROM members WHERE is_active = true AND status IN ('active', 'probation')) as active_members,
    (SELECT COUNT(*) FROM members WHERE status = 'probation') as probation_members,
    (SELECT COUNT(*) FROM members WHERE status = 'inactive') as inactive_members,
    (SELECT COUNT(*) FROM members WHERE status = 'deceased') as deceased_members,
    (SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE transaction_type IN ('contribution', 'registration', 'renewal') AND status = 'completed') as total_contributions,
    (SELECT COUNT(*) FROM cases WHERE is_active = true) as active_cases,
    (SELECT COUNT(*) FROM active_defaulters) as defaulters_count,
    (SELECT COUNT(*) FROM wrong_mpesa_transactions WHERE status = 'pending') as suspense_pending_count,
    (SELECT COALESCE(SUM(amount), 0) FROM wrong_mpesa_transactions WHERE status = 'pending') as suspense_pending_amount,
    (SELECT COUNT(*) FROM transactions WHERE metadata->>'reversed_transaction_id' IS NOT NULL) as total_reversals_count,
    (SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE metadata->>'reversed_transaction_id' IS NOT NULL) as total_reversals_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_enhanced_dashboard_summary IS 'Enhanced dashboard statistics including probation and suspense data';

-- 11. INDEX: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_probation_end_date ON members(probation_end_date);
CREATE INDEX IF NOT EXISTS idx_transactions_metadata ON transactions USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_status ON wrong_mpesa_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_matched ON wrong_mpesa_transactions(matched_member_id);

-- 12. GRANT: Permissions for views (adjust as needed)
-- Note: Adjust role names based on your Supabase setup
-- GRANT SELECT ON active_defaulters TO authenticated;
-- GRANT SELECT ON members_on_probation TO authenticated;
-- GRANT SELECT ON monthly_contributions_summary TO authenticated;
-- GRANT SELECT ON case_funding_summary TO authenticated;
-- GRANT SELECT ON member_transaction_summary TO authenticated;
-- GRANT SELECT ON reversals_audit TO authenticated;
-- GRANT SELECT ON suspense_account_summary TO authenticated;

-- End of migration
