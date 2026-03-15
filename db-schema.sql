-- =====================================================
-- MALANGA WELFARE SOCIETY DATABASE SCHEMA
-- Complete schema for members, cases, transactions, accounts
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- RESIDENCES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS residences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if they don't exist (for schema updates)
ALTER TABLE residences ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE residences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- =====================================================
-- MEMBERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_number VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    gender VARCHAR(20) CHECK (gender IN ('male', 'female')),
    date_of_birth DATE,
    national_id_number VARCHAR(50) UNIQUE,
    phone_number VARCHAR(50),
    email_address VARCHAR(255),
    residence VARCHAR(255),
    residence_id UUID REFERENCES residences(id) ON DELETE SET NULL,
    next_of_kin JSONB DEFAULT '{}',
    dependants JSONB DEFAULT '[]',
    registration_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,
    wallet_balance DECIMAL(15,2) DEFAULT 0,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if they don't exist (for schema updates)
ALTER TABLE members ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- =====================================================
-- CASES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_number VARCHAR(50) UNIQUE NOT NULL,
    affected_member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    dependant_id UUID,
    case_type VARCHAR(50) CHECK (case_type IN ('education', 'sickness', 'death', 'other')),
    description TEXT,
    contribution_per_member DECIMAL(15,2) NOT NULL,
    start_date DATE,
    end_date DATE,
    expected_amount DECIMAL(15,2),
    actual_amount DECIMAL(15,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_finalized BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if they don't exist (for schema updates)
ALTER TABLE cases ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE cases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- =====================================================
-- TRANSACTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    amount DECIMAL(15,2) NOT NULL,
    transaction_type VARCHAR(50) CHECK (transaction_type IN (
        'registration', 'renewal', 'contribution', 'penalty',
        'arrears', 'wallet_funding', 'disbursement', 'transfer'
    )),
    payment_method VARCHAR(50) DEFAULT 'cash',
    mpesa_reference VARCHAR(100),
    description TEXT,
    status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
    metadata JSONB DEFAULT '{}',
    reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if they don't exist (for schema updates)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- =====================================================
-- USERS TABLE (Admin authentication)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN (
        'super_admin', 'chairperson', 'treasurer', 'secretary', 'member'
    )),
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP WITH TIME ZONE,
    last_password_change TIMESTAMP WITH TIME ZONE,
    force_password_change BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if they don't exist (for schema updates)
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- =====================================================
-- ACCOUNTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) CHECK (type IN (
        'registration', 'renewal', 'suspense', 'arrears', 'penalty'
    )),
    description TEXT,
    balance DECIMAL(15,2) DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if they don't exist (for schema updates)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- =====================================================
-- AUDIT LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    member_id UUID,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    status VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rename timestamp column to created_at if it exists (for backward compatibility)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'timestamp') THEN
        ALTER TABLE audit_logs RENAME COLUMN timestamp TO created_at;
    END IF;
END $$;

-- Add created_at column if it doesn't exist
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- =====================================================
-- TRIGGER FUNCTIONS
-- =====================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all tables with updated_at
DROP TRIGGER IF EXISTS update_members_updated_at ON members;
CREATE TRIGGER update_members_updated_at
    BEFORE UPDATE ON members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cases_updated_at ON cases;
CREATE TRIGGER update_cases_updated_at
    BEFORE UPDATE ON cases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_residences_updated_at ON residences;
CREATE TRIGGER update_residences_updated_at
    BEFORE UPDATE ON residences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INDEXES
-- =====================================================

-- Index for residence lookups
CREATE INDEX IF NOT EXISTS idx_residences_name ON residences(name);

-- Indexes for members table
CREATE INDEX IF NOT EXISTS idx_members_member_number ON members(member_number);
CREATE INDEX IF NOT EXISTS idx_members_phone_number ON members(phone_number);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(name);
CREATE INDEX IF NOT EXISTS idx_members_is_active ON members(is_active);
CREATE INDEX IF NOT EXISTS idx_members_residence ON members(residence);
CREATE INDEX IF NOT EXISTS idx_members_created_at ON members(created_at);

-- Indexes for cases table
CREATE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number);
CREATE INDEX IF NOT EXISTS idx_cases_affected_member_id ON cases(affected_member_id);
CREATE INDEX IF NOT EXISTS idx_cases_case_type ON cases(case_type);
CREATE INDEX IF NOT EXISTS idx_cases_is_active ON cases(is_active);
CREATE INDEX IF NOT EXISTS idx_cases_is_finalized ON cases(is_finalized);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at);

-- Indexes for transactions table
CREATE INDEX IF NOT EXISTS idx_transactions_member_id ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_case_id ON transactions(case_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_mpesa_reference ON transactions(mpesa_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_member_id ON users(member_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for audit logs
DROP INDEX IF EXISTS idx_audit_logs_timestamp;
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

-- =====================================================
-- DATABASE RPC FUNCTIONS (for performance)
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

-- Function to get defaulters count
CREATE OR REPLACE FUNCTION get_defaulters_count()
RETURNS TABLE(member_id UUID, name VARCHAR, balance DECIMAL(15,2)) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.name,
        calculate_wallet_balance(m.id) as balance
    FROM members m
    WHERE calculate_wallet_balance(m.id) < 0
    AND m.is_active = true
    ORDER BY balance ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get total contributions
CREATE OR REPLACE FUNCTION get_total_contributions()
RETURNS DECIMAL(15,2) AS $$
DECLARE
    total DECIMAL(15,2);
BEGIN
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO total
    FROM transactions
    WHERE transaction_type = 'contribution'
    AND status = 'completed';
    
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Function to get member contributions for a specific case
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
    OR (description ILIKE '%' || case_num || '%' AND transaction_type = 'contribution');
    
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Function to get members count by status
CREATE OR REPLACE FUNCTION get_members_count(p_is_active BOOLEAN DEFAULT true)
RETURNS BIGINT AS $$
DECLARE
    count_val BIGINT;
BEGIN
    SELECT COUNT(*) INTO count_val
    FROM members
    WHERE is_active = p_is_active;
    
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
    registration_date DATE,
    wallet_balance DECIMAL(15,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.member_number,
        m.name,
        m.phone_number,
        m.registration_date,
        calculate_wallet_balance(m.id) as wallet_balance
    FROM members m
    ORDER BY m.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent transactions
CREATE OR REPLACE FUNCTION get_recent_transactions(p_limit INT DEFAULT 10)
RETURNS TABLE(
    id UUID,
    member_id UUID,
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
        t.amount,
        t.transaction_type,
        t.description,
        t.created_at
    FROM transactions t
    ORDER BY t.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SEQUENCES FOR AUTO-INCREMENT
-- =====================================================

-- Create sequence for member numbers if needed
CREATE SEQUENCE IF NOT EXISTS member_number_seq;

-- Create sequence for case numbers if needed
CREATE SEQUENCE IF NOT EXISTS case_number_seq;

-- =====================================================
-- DEFAULT DATA
-- =====================================================

-- Insert default system accounts
INSERT INTO accounts (name, type, description, balance, is_system) VALUES
    ('Registration Fee Account', 'registration', 'Registration fee collections', 0, true),
    ('Renewal Fee Account', 'renewal', 'Annual renewal fee collections', 0, true),
    ('Suspense Account', 'suspense', 'Temporary holding account', 0, true),
    ('Arrears Account', 'arrears', 'Outstanding payments', 0, true),
    ('Penalty Account', 'penalty', 'Penalty collections', 0, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE members IS 'Registered welfare society members';
COMMENT ON TABLE cases IS 'Welfare cases (education, sickness, death assistance)';
COMMENT ON TABLE transactions IS 'All financial transactions';
COMMENT ON TABLE users IS 'Admin and staff user accounts';
COMMENT ON TABLE accounts IS 'System financial accounts for tracking';
COMMENT ON TABLE audit_logs IS 'Audit trail for all system actions';

-- End of schema
