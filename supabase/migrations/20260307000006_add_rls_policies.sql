-- Migration: Add Row Level Security (RLS) policies
-- Date: 2026-03-07
-- Purpose: Implement row-level security to restrict data access by user role
-- Phase: 4 (Security Hardening)
-- STATUS: DISABLED. 
-- The application relies on custom auth (bcrypt + LocalStorage) rather than Supabase Auth.
-- Because `auth.uid()` is null for API requests executed with the `anon` key,
-- these policies caused infinite recursion on login and blocked access.

/*
-- Enable RLS on critical tables
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- MEMBERS TABLE RLS POLICIES
-- ============================================

-- Admins can see all members
CREATE POLICY admin_see_all_members ON members
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- Members can only see their own data
CREATE POLICY member_see_own_data ON members
  FOR SELECT
  USING (
    id IN (SELECT member_id FROM users WHERE id = auth.uid()) OR
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- Only admins can insert members
CREATE POLICY admin_insert_members ON members
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- Only admins can update members
CREATE POLICY admin_update_members ON members
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- ============================================
-- TRANSACTIONS TABLE RLS POLICIES
-- ============================================

-- Admins can see all transactions
CREATE POLICY admin_see_all_transactions ON transactions
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- Members can only see their own transactions
CREATE POLICY member_see_own_transactions ON transactions
  FOR SELECT
  USING (
    member_id IN (
      SELECT member_id FROM users WHERE id = auth.uid()
    ) OR
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- Only system functions can insert transactions (no direct user insert)
CREATE POLICY functions_insert_transactions ON transactions
  FOR INSERT
  WITH CHECK (
    current_setting('app.bypass_rls') != 'on'
  );

-- ============================================
-- CASES TABLE RLS POLICIES
-- ============================================

-- Admins can see all cases
CREATE POLICY admin_see_all_cases ON cases
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- Members can see their own cases
CREATE POLICY member_see_own_cases ON cases
  FOR SELECT
  USING (
    affected_member_id IN (
      SELECT member_id FROM users WHERE id = auth.uid()
    ) OR
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- ============================================
-- USERS TABLE RLS POLICIES (Self-service only)
-- ============================================

-- Users can only see their own user record
CREATE POLICY user_see_own_user ON users
  FOR SELECT
  USING (
    auth.uid() = id
  );

-- Admins can see all users
CREATE POLICY admin_see_all_users ON users
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- ============================================
-- AUDIT_LOGS TABLE RLS POLICIES (Admins only)
-- ============================================

-- Only admins can see audit logs
CREATE POLICY admin_see_audit_logs ON audit_logs
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- Audit logs are auto-inserted by triggers (no direct user insert)
CREATE POLICY functions_insert_audit_logs ON audit_logs
  FOR INSERT
  WITH CHECK (
    current_setting('app.bypass_rls') != 'on'
  );
*/