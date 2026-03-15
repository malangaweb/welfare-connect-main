-- Migration: Create database function for defaulters calculation
-- Date: 2026-03-07
-- Purpose: Replace N+1 query pattern with efficient database aggregation

CREATE OR REPLACE FUNCTION get_defaulters(limit_count INT DEFAULT 100)
RETURNS TABLE (
  member_id UUID,
  member_number TEXT,
  name TEXT,
  phone_number TEXT,
  wallet_balance NUMERIC,
  transaction_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.member_number,
    m.name,
    m.phone_number,
    COALESCE(SUM(t.amount), 0)::NUMERIC as wallet_balance,
    COUNT(t.id)::INT as transaction_count
  FROM members m
  LEFT JOIN transactions t ON t.member_id = m.id
  WHERE m.is_active = true
  GROUP BY m.id, m.member_number, m.name, m.phone_number
  HAVING COALESCE(SUM(t.amount), 0) < 0
  ORDER BY wallet_balance ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create function for dashboard summary
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS TABLE (
  total_members INT,
  active_members INT,
  defaulters_count INT,
  total_wallet_balance NUMERIC,
  active_cases INT,
  total_contributions NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT m.id)::INT as total_members,
    COUNT(DISTINCT CASE WHEN m.is_active THEN m.id END)::INT as active_members,
    COUNT(DISTINCT CASE WHEN COALESCE(SUM(t.amount), 0) < 0 THEN m.id END)::INT as defaulters_count,
    SUM(t.amount)::NUMERIC as total_wallet_balance,
    COUNT(DISTINCT CASE WHEN c.is_active THEN c.id END)::INT as active_cases,
    SUM(CASE WHEN t.transaction_type = 'contribution' THEN ABS(t.amount) ELSE 0 END)::NUMERIC as total_contributions
  FROM members m
  LEFT JOIN transactions t ON t.member_id = m.id
  LEFT JOIN cases c ON c.is_active = true
  GROUP BY 1;
END;
$$ LANGUAGE plpgsql;

-- Create function for member wallet balance
CREATE OR REPLACE FUNCTION get_member_wallet_balance(member_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  balance NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0)::NUMERIC
  INTO balance
  FROM transactions
  WHERE member_id = $1;
  
  RETURN balance;
END;
$$ LANGUAGE plpgsql;
