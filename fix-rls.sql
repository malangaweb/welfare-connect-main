-- Remove Row Level Security that causes infinite recursion and blocks custom auth
-- The application uses a custom authentication system (bcrypt + localStorage) rather than Supabase Auth.
-- Because of this, the `anon` key is used for requests, and `auth.uid()` is null.
-- The current policies block all access and the query on `users` within the policy causes infinite recursion.

-- 1. Disable RLS on tables where it was enabled in the recent migration
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE members DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- 2. Drop the recursive and blocking policies
DROP POLICY IF EXISTS admin_see_all_users ON users;
DROP POLICY IF EXISTS user_see_own_user ON users;

DROP POLICY IF EXISTS admin_see_all_members ON members;
DROP POLICY IF EXISTS member_see_own_data ON members;
DROP POLICY IF EXISTS admin_insert_members ON members;
DROP POLICY IF EXISTS admin_update_members ON members;

DROP POLICY IF EXISTS admin_see_all_transactions ON transactions;
DROP POLICY IF EXISTS member_see_own_transactions ON transactions;
DROP POLICY IF EXISTS functions_insert_transactions ON transactions;

DROP POLICY IF EXISTS admin_see_all_cases ON cases;
DROP POLICY IF EXISTS member_see_own_cases ON cases;

DROP POLICY IF EXISTS admin_see_audit_logs ON audit_logs;
DROP POLICY IF EXISTS functions_insert_audit_logs ON audit_logs;

-- 3. Ensure the anon role (which the app uses) has access
GRANT ALL ON users TO anon;
GRANT ALL ON members TO anon;
GRANT ALL ON transactions TO anon;
GRANT ALL ON cases TO anon;
GRANT ALL ON audit_logs TO anon;
