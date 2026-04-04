-- =====================================================
-- MIGRATION: Disable RLS on wrong_mpesa_transactions
-- =====================================================
-- The app uses custom authentication (localStorage-based),
-- not Supabase Auth. This means RLS policies that rely on
-- auth.uid() will block all frontend queries.
--
-- Since the app has its own authorization checks in
-- src/lib/authorization.ts, we can safely disable RLS
-- on this table.
-- =====================================================

-- Disable Row Level Security
ALTER TABLE wrong_mpesa_transactions DISABLE ROW LEVEL SECURITY;

-- Drop the old RLS policies (cleanup)
DROP POLICY IF EXISTS "Service role has full access" ON wrong_mpesa_transactions;
DROP POLICY IF EXISTS "Admins can view suspense transactions" ON wrong_mpesa_transactions;
DROP POLICY IF EXISTS "Super admins can update suspense transactions" ON wrong_mpesa_transactions;
DROP POLICY IF EXISTS "Super admins can insert suspense transactions" ON wrong_mpesa_transactions;

-- Optional: Add a comment explaining why RLS is disabled
COMMENT ON TABLE wrong_mpesa_transactions IS 'Suspense account for unmatched M-Pesa payments. RLS disabled - app uses custom auth with authorization checks in src/lib/authorization.ts';
