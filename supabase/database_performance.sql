-- =====================================================
-- DATABASE PERFORMANCE OPTIMIZATION
-- Add indexes and optimize queries
-- =====================================================

-- =====================================================
-- ADDITIONAL INDEXES FOR PERFORMANCE
-- =====================================================

-- Members table indexes
CREATE INDEX IF NOT EXISTS idx_members_phone_number ON members(phone_number);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(name);
CREATE INDEX IF NOT EXISTS idx_members_is_active ON members(is_active);
CREATE INDEX IF NOT EXISTS idx_members_residence ON members(residence);
CREATE INDEX IF NOT EXISTS idx_members_created_at ON members(created_at);
CREATE INDEX IF NOT EXISTS idx_members_registration_date ON members(registration_date);

-- Transactions table indexes  
CREATE INDEX IF NOT EXISTS idx_transactions_member_id ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_case_id ON transactions(case_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_mpesa_reference ON transactions(mpesa_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_transactions_member_type ON transactions(member_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_member_created ON transactions(member_id, created_at DESC);

-- Cases table indexes
CREATE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number);
CREATE INDEX IF NOT EXISTS idx_cases_affected_member_id ON cases(affected_member_id);
CREATE INDEX IF NOT EXISTS idx_cases_case_type ON cases(case_type);
CREATE INDEX IF NOT EXISTS idx_cases_is_active ON cases(is_active);
CREATE INDEX IF NOT EXISTS idx_cases_is_finalized ON cases(is_finalized);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_member_id ON users(member_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_member_id ON audit_logs(member_id);

-- Residences indexes
CREATE INDEX IF NOT EXISTS idx_residences_name ON residences(name);
CREATE INDEX IF NOT EXISTS idx_residences_location ON residences(location);

-- =====================================================
-- DATABASE FUNCTIONS FOR AGGREGATIONS
-- =====================================================

-- Function to calculate member wallet balance
CREATE OR REPLACE FUNCTION calculate_wallet_balance(p_member_id UUID)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    balance DECIMAL(15,2);
BEGIN
    SELECT COALESCE(SUM(
        CASE 
            WHEN transaction_type IN ('registration', 'renewal', 'contribution', 'penalty', 'arrears') THEN -ABS(amount)
            ELSE amount
        END
    ), 0) INTO balance
    FROM transactions
    WHERE member_id = p_member_id;
    
    RETURN balance;
END;
$$ LANGUAGE plpgsql;

-- Function to get defaulters (members with negative balance)
CREATE OR REPLACE FUNCTION get_defaulters(p_include_inactive BOOLEAN DEFAULT false)
RETURNS TABLE(
    member_id UUID,
    member_number VARCHAR(50),
    name VARCHAR(255),
    phone_number VARCHAR(50),
    residence VARCHAR(255),
    balance DECIMAL(15,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id AS member_id,
        m.member_number,
        m.name,
        m.phone_number,
        m.residence,
        calculate_wallet_balance(m.id) AS balance
    FROM members m
    WHERE calculate_wallet_balance(m.id) < 0
    AND (p_include_inactive OR m.is_active = true)
    ORDER BY balance ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get total contributions
CREATE OR REPLACE FUNCTION get_total_contributions(p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    total DECIMAL(15,2);
BEGIN
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO total
    FROM transactions
    WHERE transaction_type = 'contribution'
    AND status = 'completed'
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);
    
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Function to get total registration fees
CREATE OR REPLACE FUNCTION get_total_registration_fees()
RETURNS DECIMAL(15,2) AS $$
DECLARE
    total DECIMAL(15,2);
BEGIN
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO total
    FROM transactions
    WHERE transaction_type = 'registration'
    AND status = 'completed';
    
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Function to get case contributions
CREATE OR REPLACE FUNCTION get_case_contributions(p_case_id UUID)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    total DECIMAL(15,2);
    case_num VARCHAR(50);
BEGIN
    SELECT case_number INTO case_num FROM cases WHERE id = p_case_id;
    
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO total
    FROM transactions
    WHERE case_id = p_case_id
    OR (description ILIKE '%' || case_num || '%' AND transaction_type = 'contribution')
    AND status = 'completed';
    
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Function to get members count
CREATE OR REPLACE FUNCTION get_members_count(p_is_active BOOLEAN DEFAULT NULL)
RETURNS BIGINT AS $$
DECLARE
    count_val BIGINT;
BEGIN
    SELECT COUNT(*) INTO count_val
    FROM members
    WHERE p_is_active IS NULL OR is_active = p_is_active;
    
    RETURN count_val;
END;
$$ LANGUAGE plpgsql;

-- Function to get active cases count
CREATE OR REPLACE FUNCTION get_active_cases_count()
RETURNS BIGINT AS $$
DECLARE
    count_val BIGINT;
BEGIN
    SELECT COUNT(*) INTO count_val
    FROM cases
    WHERE is_active = true;
    
    RETURN count_val;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent members
CREATE OR REPLACE FUNCTION get_recent_members(p_limit INT DEFAULT 10)
RETURNS TABLE(
    id UUID,
    member_number VARCHAR(50),
    name VARCHAR(255),
    phone_number VARCHAR(50),
    residence VARCHAR(255),
    registration_date DATE,
    balance DECIMAL(15,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.member_number,
        m.name,
        m.phone_number,
        m.residence,
        m.registration_date,
        calculate_wallet_balance(m.id) as balance
    FROM members m
    ORDER BY m.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent transactions with member info
CREATE OR REPLACE FUNCTION get_recent_transactions(p_limit INT DEFAULT 10)
RETURNS TABLE(
    id UUID,
    member_id UUID,
    member_name VARCHAR(255),
    amount DECIMAL(15,2),
    transaction_type VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.member_id,
        m.name as member_name,
        t.amount,
        t.transaction_type,
        t.description,
        t.created_at
    FROM transactions t
    LEFT JOIN members m ON t.member_id = m.id
    ORDER BY t.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get dashboard summary
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS TABLE(
    total_members BIGINT,
    active_members BIGINT,
    inactive_members BIGINT,
    total_cases BIGINT,
    active_cases BIGINT,
    total_contributions DECIMAL(15,2),
    total_registration_fees DECIMAL(15,2),
    defaulters_count BIGINT
) AS $$
DECLARE
    result RECORD;
BEGIN
    SELECT 
        COUNT(*) INTO result.total_members FROM members,
        COUNT(*) FILTER (WHERE is_active = true) INTO result.active_members FROM members,
        COUNT(*) FILTER (WHERE is_active = false) INTO result.inactive_members FROM members,
        COUNT(*) INTO result.total_cases FROM cases,
        COUNT(*) FILTER (WHERE is_active = true) INTO result.active_cases FROM cases,
        get_total_contributions() INTO result.total_contributions,
        get_total_registration_fees() INTO result.total_registration_fees,
        COUNT(*) FILTER (WHERE balance < 0) INTO result.defaulters_count
    FROM members m
    CROSS JOIN LATERAL calculate_wallet_balance(m.id) AS balance;
    
    RETURN QUERY SELECT result.total_members, result.active_members, result.inactive_members, 
                       result.total_cases, result.active_cases, result.total_contributions, 
                       result.total_registration_fees, result.defaulters_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MATERIALIZED VIEW FOR MEMBER BALANCES
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS member_wallet_balances AS
SELECT 
    m.id as member_id,
    m.member_number,
    m.name,
    m.phone_number,
    m.residence,
    m.is_active,
    COALESCE(SUM(
        CASE 
            WHEN t.transaction_type IN ('registration', 'renewal', 'contribution', 'penalty', 'arrears') THEN -ABS(t.amount)
            ELSE t.amount
        END
    ), 0) as wallet_balance
FROM members m
LEFT JOIN transactions t ON m.id = t.member_id
GROUP BY m.id, m.member_number, m.name, m.phone_number, m.residence, m.is_active;

-- Index on materialized view
CREATE INDEX IF NOT EXISTS idx_member_wallet_balances_balance ON member_wallet_balances(wallet_balance);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_member_wallet_balances()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY member_wallet_balances;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ANALYZE TABLES
-- =====================================================

ANALYZE members;
ANALYZE transactions;
ANALYZE cases;
ANALYZE users;
ANALYZE audit_logs;
ANALYZE residences;
ANALYZE accounts;
