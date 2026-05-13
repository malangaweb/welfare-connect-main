-- =====================================================
-- Disable RLS on core tables for custom app authentication
-- =====================================================
-- App uses custom JWT/authz in app layer + edge functions, not Supabase Auth.
-- RLS policies tied to anon/authenticated roles can block valid app writes.

ALTER TABLE public.members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY;

-- Cleanup legacy policies (best-effort).
DROP POLICY IF EXISTS members_public_read ON public.members;
DROP POLICY IF EXISTS members_authenticated_write ON public.members;
DROP POLICY IF EXISTS admin_see_all_members ON public.members;
DROP POLICY IF EXISTS member_see_own_data ON public.members;
DROP POLICY IF EXISTS admin_insert_members ON public.members;
DROP POLICY IF EXISTS admin_update_members ON public.members;

DROP POLICY IF EXISTS accounts_public_read ON public.accounts;
DROP POLICY IF EXISTS accounts_authenticated_rw ON public.accounts;

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.settings;

COMMENT ON TABLE public.members IS
  'RLS disabled for custom auth model; authorization enforced by app/edge functions.';
COMMENT ON TABLE public.accounts IS
  'RLS disabled for custom auth model; authorization enforced by app/edge functions.';
COMMENT ON TABLE public.settings IS
  'RLS disabled for custom auth model; authorization enforced by app/edge functions.';

