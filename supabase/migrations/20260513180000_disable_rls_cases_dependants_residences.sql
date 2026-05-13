-- =====================================================
-- Disable RLS on cases, dependants, and residences for custom auth
-- =====================================================
-- These 3 tables were missed in the previous migration
-- (20260513170000_disable_rls_for_custom_auth_core_tables.sql).
-- 
-- The frontend (using anon key) directly inserts/updates/deletes on:
--   cases       - NewCase.tsx (insert), CaseDetails.tsx (update/delete), EditCase.tsx (update)
--   dependants  - MemberDetails.tsx (insert, delete)
--   residences  - ResidenceForm.tsx (insert)
--
-- The Flutter app (also using anon key) updates cases too.
--
-- This app uses custom JWT auth in app-layer code, not Supabase Auth.
-- RLS policies bound to auth.uid() always return NULL with custom auth,
-- so they block legitimate app writes.
-- =====================================================

ALTER TABLE public.cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dependants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.residences DISABLE ROW LEVEL SECURITY;

-- Cleanup stale policies on cases
DROP POLICY IF EXISTS cases_public_read ON public.cases;
DROP POLICY IF EXISTS cases_authenticated_write ON public.cases;
DROP POLICY IF EXISTS "Allow public to create cases" ON public.cases;
DROP POLICY IF EXISTS "Allow public to read cases" ON public.cases;

-- Cleanup stale policies on dependants
DROP POLICY IF EXISTS dependants_authenticated_rw ON public.dependants;
DROP POLICY IF EXISTS "Allow all inserts" ON public.dependants;
DROP POLICY IF EXISTS "Allow all select" ON public.dependants;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.dependants;

-- Cleanup stale policies on residences
DROP POLICY IF EXISTS residences_authenticated_rw ON public.residences;
DROP POLICY IF EXISTS "Allow anyone to read residences" ON public.residences;
DROP POLICY IF EXISTS "Allow authenticated to insert residences" ON public.residences;

COMMENT ON TABLE public.cases IS
  'RLS disabled for custom auth model; authorization enforced by app/edge functions.';
COMMENT ON TABLE public.dependants IS
  'RLS disabled for custom auth model; authorization enforced by app/edge functions.';
COMMENT ON TABLE public.residences IS
  'RLS disabled for custom auth model; authorization enforced by app/edge functions.';
