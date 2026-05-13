-- =====================================================
-- Disable RLS on transactions for custom app authentication
-- =====================================================
-- The frontend performs direct inserts/updates on public.transactions
-- for wallet funding, pay-to-case, arrears/penalty deductions, etc.
-- This app uses custom JWT auth in app-layer code, not Supabase Auth.
-- Therefore, RLS policies bound to PostgREST role auth block writes.
-- =====================================================

ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;

-- Cleanup stale policies that are no longer evaluated once RLS is disabled.
DROP POLICY IF EXISTS transactions_authenticated_rw ON public.transactions;
DROP POLICY IF EXISTS transactions_public_read ON public.transactions;
DROP POLICY IF EXISTS admin_see_all_transactions ON public.transactions;
DROP POLICY IF EXISTS member_see_own_transactions ON public.transactions;
DROP POLICY IF EXISTS functions_insert_transactions ON public.transactions;

COMMENT ON TABLE public.transactions IS
  'Core ledger table. RLS disabled because app uses custom auth/authorization in application and edge functions.';

