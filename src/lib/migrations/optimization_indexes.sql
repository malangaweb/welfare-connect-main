-- ============================================================
-- Performance Optimization Indexes
-- ============================================================
-- This migration creates composite indexes for common query patterns
-- to significantly improve database query performance.
--
-- Run this migration in your Supabase SQL editor
-- ============================================================

-- ============================================================
-- Index: idx_transactions_member_created
-- Purpose: Optimizes member transaction history queries
-- Usage: SELECT * FROM transactions WHERE member_id = ? ORDER BY created_at DESC
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_member_created 
ON transactions (member_id, created_at DESC);

-- ============================================================
-- Index: idx_cases_affected_member_created
-- Purpose: Optimizes member cases queries
-- Usage: SELECT * FROM cases WHERE affected_member_id = ? ORDER BY created_at DESC
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cases_affected_member_created 
ON cases (affected_member_id, created_at DESC);

-- ============================================================
-- Index: idx_members_active_created
-- Purpose: Optimizes active member listing queries
-- Usage: SELECT * FROM members WHERE is_active = true ORDER BY created_at DESC
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_members_active_created 
ON members (is_active, created_at DESC);

-- ============================================================
-- Index: idx_transactions_status_created
-- Purpose: Optimizes pending/all transactions queries
-- Usage: SELECT * FROM transactions WHERE status = ? ORDER BY created_at DESC
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_status_created 
ON transactions (status, created_at DESC);

-- ============================================================
-- Additional Performance Indexes
-- ============================================================

-- Index for member search by name (commonly used in search)
CREATE INDEX IF NOT EXISTS idx_members_name_search 
ON members (lower(first_name), lower(last_name));

-- Index for member number lookups
CREATE INDEX IF NOT EXISTS idx_members_member_number 
ON members (member_number);

-- Index for cases by status (for filtering)
CREATE INDEX IF NOT EXISTS idx_cases_status 
ON cases (status);

-- Index for transactions by type (for filtering)
CREATE INDEX IF NOT EXISTS idx_transactions_type 
ON transactions (type);

-- Index for cases by type (for filtering)
CREATE INDEX IF NOT EXISTS idx_cases_type 
ON cases (case_type);

-- Index for membership fees by status
CREATE INDEX IF NOT EXISTS idx_membership_fees_status 
ON membership_fees (status);

-- Index for wallet transactions
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_member 
ON wallet_transactions (member_id, created_at DESC);

-- ============================================================
-- Verify indexes were created
-- ============================================================
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY indexname;
