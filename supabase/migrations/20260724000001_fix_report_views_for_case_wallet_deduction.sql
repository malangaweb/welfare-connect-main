-- Fix report views to include case_wallet_deduction transaction type
-- The system migrated from 'contribution' to 'case_wallet_deduction'
-- as the primary case payment type, but the report views still only filter on 'contribution'

-- 1. monthly_contributions_summary: missing case_wallet_deduction and wallet_funding
CREATE OR REPLACE VIEW monthly_contributions_summary AS
SELECT
  DATE_TRUNC('month', t.created_at) as month,
  t.transaction_type,
  COUNT(*) as transaction_count,
  SUM(ABS(t.amount)) as total_amount,
  COUNT(DISTINCT t.member_id) as unique_members
FROM transactions t
WHERE (t.status IS NULL OR t.status = '' OR lower(t.status) IN ('completed', 'success'))
  AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'wallet_funding', 'registration', 'renewal', 'penalty', 'arrears')
GROUP BY DATE_TRUNC('month', t.created_at), t.transaction_type
ORDER BY month DESC, t.transaction_type;

COMMENT ON VIEW monthly_contributions_summary IS 'Monthly summary of contributions by type (includes case_wallet_deduction)';

-- 2. member_transaction_summary: missing case_wallet_deduction from contribution counts
CREATE OR REPLACE VIEW member_transaction_summary AS
SELECT
  m.id as member_id,
  m.member_number,
  m.name,
  m.phone_number,
  m.status,
  m.wallet_balance,
  COUNT(CASE WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'registration', 'renewal') THEN 1 END) as contributions_count,
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'registration', 'renewal') THEN ABS(t.amount) END), 0) as total_contributions,
  COUNT(CASE WHEN t.transaction_type = 'disbursement' THEN 1 END) as disbursements_count,
  COALESCE(SUM(CASE WHEN t.transaction_type = 'disbursement' THEN ABS(t.amount) END), 0) as total_disbursements,
  MAX(t.created_at) as last_transaction_date
FROM members m
LEFT JOIN transactions t ON t.member_id = m.id
  AND (t.status IS NULL OR t.status = '' OR lower(t.status) IN ('completed', 'success'))
GROUP BY m.id, m.member_number, m.name, m.phone_number, m.status, m.wallet_balance
ORDER BY m.member_number;

COMMENT ON VIEW member_transaction_summary IS 'Summary of member transaction activity (includes case_wallet_deduction)';

-- 3. case_funding_summary: filter transaction types to only include case payments
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
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(t.amount) ELSE 0 END), 0) as actual_amount,
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(t.amount) ELSE 0 END), 0) - c.expected_amount as variance,
  c.is_active,
  c.is_finalized
FROM cases c
LEFT JOIN transactions t ON t.case_id = c.id
  AND (t.status IS NULL OR t.status = '' OR lower(t.status) IN ('completed', 'success'))
  AND t.transaction_type IN ('contribution', 'case_wallet_deduction')
GROUP BY c.id, c.case_number, c.case_type, c.affected_member_id,
         c.contribution_per_member, c.start_date, c.end_date,
         c.expected_amount, c.is_active, c.is_finalized
ORDER BY c.created_at DESC;

COMMENT ON VIEW case_funding_summary IS 'Summary of case funding progress (filtered to case payment types)';

-- 4. get_enhanced_dashboard_summary: missing case_wallet_deduction in total_contributions
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
    (SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE transaction_type IN ('contribution', 'case_wallet_deduction', 'registration', 'renewal') AND (status IS NULL OR status = '' OR lower(status) IN ('completed', 'success'))) as total_contributions,
    (SELECT COUNT(*) FROM cases WHERE is_active = true) as active_cases,
    (SELECT COUNT(*) FROM active_defaulters) as defaulters_count,
    (SELECT COUNT(*) FROM wrong_mpesa_transactions WHERE status = 'pending') as suspense_pending_count,
    (SELECT COALESCE(SUM(amount), 0) FROM wrong_mpesa_transactions WHERE status = 'pending') as suspense_pending_amount,
    (SELECT COUNT(*) FROM transactions WHERE metadata->>'reversed_transaction_id' IS NOT NULL) as total_reversals_count,
    (SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE metadata->>'reversed_transaction_id' IS NOT NULL) as total_reversals_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_enhanced_dashboard_summary IS 'Enhanced dashboard statistics (includes case_wallet_deduction contributions)';

-- Grant permissions
GRANT SELECT ON monthly_contributions_summary TO anon, authenticated, service_role;
GRANT SELECT ON member_transaction_summary TO anon, authenticated, service_role;
GRANT SELECT ON case_funding_summary TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_enhanced_dashboard_summary() TO anon, authenticated, service_role;

-- 5. active_defaulters: include members with unpaid case obligations
CREATE OR REPLACE VIEW active_defaulters AS
SELECT DISTINCT ON (m.id)
  m.id,
  m.member_number,
  m.name,
  m.phone_number,
  m.email_address,
  m.status,
  CASE
    WHEN m.wallet_balance < 0 THEN m.wallet_balance
    WHEN uo.unpaid_total IS NOT NULL AND uo.unpaid_total > 0 THEN (-(uo.unpaid_total)::numeric)
    ELSE m.wallet_balance
  END as wallet_balance,
  m.registration_date,
  m.probation_end_date,
  m.is_active,
  m.created_at
FROM members m
LEFT JOIN v_member_unpaid_obligations_summary uo ON uo.member_id = m.id
WHERE (
  m.wallet_balance < 0
  OR (uo.unpaid_total IS NOT NULL AND uo.unpaid_total > 0)
)
  AND m.status NOT IN ('deceased')
ORDER BY m.id, wallet_balance ASC;

GRANT SELECT ON active_defaulters TO anon, authenticated, service_role;
