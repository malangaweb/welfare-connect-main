-- Audit check: identify wallet_balance vs case progress drift
--
-- This script finds members where their wallet_balance doesn't match
-- the calculated balance from the transactions ledger, AND/OR where
-- their case progress status differs from what transactions would indicate.
--
-- Run this after manual edits to see what needs fixing.

-- 1. Wallet balance drift (stored vs calculated from transactions)
SELECT
  m.member_number,
  m.name,
  m.wallet_balance AS stored_balance,
  calculate_wallet_balance(m.id) AS calculated_balance,
  (m.wallet_balance - calculate_wallet_balance(m.id)) AS drift
FROM members m
WHERE m.wallet_balance IS DISTINCT FROM calculate_wallet_balance(m.id)
ORDER BY ABS(m.wallet_balance - calculate_wallet_balance(m.id)) DESC;

-- 2. Members with case progress that doesn't match their transactions
--    (cases where paid = false but transactions exist, or vice versa)
WITH member_case_payment AS (
  SELECT
    t.member_id,
    t.case_id,
    SUM(CASE
      WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears')
        THEN ABS(COALESCE(t.amount, 0))
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund')
        THEN -ABS(COALESCE(t.amount, 0))
      ELSE 0
    END) AS net_paid
  FROM transactions t
  WHERE COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    AND t.case_id IS NOT NULL
  GROUP BY t.member_id, t.case_id
)
SELECT
  m.member_number,
  m.name,
  c.case_number,
  c.contribution_per_member,
  COALESCE(mcp.net_paid, 0) AS net_paid,
  CASE
    WHEN COALESCE(mcp.net_paid, 0) >= COALESCE(c.contribution_per_member, 0) THEN TRUE
    ELSE FALSE
  END AS should_be_paid
FROM members m
CROSS JOIN cases c
LEFT JOIN member_case_payment mcp ON mcp.member_id = m.id AND mcp.case_id = c.id
WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
  AND m.status IN ('active', 'probation')
  AND COALESCE(mcp.net_paid, 0) > 0
  AND c.contribution_per_member > 0
  AND COALESCE(mcp.net_paid, 0) < COALESCE(c.contribution_per_member, 0)
ORDER BY m.member_number, c.case_number;

-- 3. To fix drift, run:
--    SELECT refresh_all_member_wallet_balances();
--    
--    To record a payment for a specific member+case, use:
--    SELECT admin_record_case_payment(
--      p_admin_id := '<admin-uuid>',
--      p_member_id := '<member-uuid>',
--      p_case_id := '<case-uuid>',
--      p_amount := <amount>,
--      p_transaction_type := 'case_wallet_deduction'
--    );
