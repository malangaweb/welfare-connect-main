-- Security hardening pass for Supabase linter findings:
-- - Enable RLS on exposed tables
-- - Replace permissive/missing policies with explicit role-scoped policies
-- - Force security invoker on flagged views
-- - Pin function search_path to avoid mutable search_path warnings
-- - Remove anon execute access from SECURITY DEFINER functions

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts',
    'audit_logs',
    'case_defaulters',
    'cases',
    'dependants',
    'login_attempts',
    'member_default_streaks',
    'member_reinstatement_events',
    'member_status_transitions',
    'members',
    'mpesa_transactions',
    'residences',
    'sms_logs',
    'sms_settings',
    'transactions',
    'wrong_mpesa_transactions',
    'wrong_mpesa_transactions_quarantine_archive'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Remove overly broad legacy policies on core tables where identified by linter.
DROP POLICY IF EXISTS "Allow public to create cases" ON public.cases;
DROP POLICY IF EXISTS "Allow public to read cases" ON public.cases;
DROP POLICY IF EXISTS "Allow all inserts" ON public.dependants;
DROP POLICY IF EXISTS "Allow all select" ON public.dependants;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.dependants;
DROP POLICY IF EXISTS "Allow all inserts" ON public.members;
DROP POLICY IF EXISTS "Allow all select" ON public.members;
DROP POLICY IF EXISTS "Allow public to read members" ON public.members;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.members;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.members;
DROP POLICY IF EXISTS "Allow anyone to read residences" ON public.residences;
DROP POLICY IF EXISTS "Allow authenticated to insert residences" ON public.residences;

-- Core tables: authenticated users can read/write; anon can read members/cases only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'members' AND policyname = 'members_public_read') THEN
    CREATE POLICY members_public_read ON public.members FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'members' AND policyname = 'members_authenticated_write') THEN
    CREATE POLICY members_authenticated_write ON public.members FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cases' AND policyname = 'cases_public_read') THEN
    CREATE POLICY cases_public_read ON public.cases FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cases' AND policyname = 'cases_authenticated_write') THEN
    CREATE POLICY cases_authenticated_write ON public.cases FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dependants' AND policyname = 'dependants_authenticated_rw') THEN
    CREATE POLICY dependants_authenticated_rw ON public.dependants FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'residences' AND policyname = 'residences_authenticated_rw') THEN
    CREATE POLICY residences_authenticated_rw ON public.residences FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounts' AND policyname = 'accounts_authenticated_rw') THEN
    CREATE POLICY accounts_authenticated_rw ON public.accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'transactions_authenticated_rw') THEN
    CREATE POLICY transactions_authenticated_rw ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Supporting tables: keep read/write off for anon; allow authenticated read
-- and service role full access for backend jobs/functions.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_logs',
    'case_defaulters',
    'login_attempts',
    'member_default_streaks',
    'member_reinstatement_events',
    'member_status_transitions',
    'mpesa_transactions',
    'sms_logs',
    'sms_settings',
    'wrong_mpesa_transactions',
    'wrong_mpesa_transactions_quarantine_archive'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_authenticated_read'
    ) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_authenticated_read', t);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_service_role_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t || '_service_role_all',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Fix security definer view findings by forcing invoker semantics.
ALTER VIEW IF EXISTS public.member_wallet_balance_drift SET (security_invoker = true);
ALTER VIEW IF EXISTS public.reversals_audit SET (security_invoker = true);
ALTER VIEW IF EXISTS public.active_defaulters SET (security_invoker = true);
ALTER VIEW IF EXISTS public.members_on_probation SET (security_invoker = true);
ALTER VIEW IF EXISTS public.monthly_contributions_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.case_funding_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.member_transaction_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_member_status_distribution SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_member_discipline_metrics SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_member_unpaid_obligations_summary SET (security_invoker = true);

-- Lock down function search_path for all user-defined functions in public.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_get_userbyid(p.proowner) = current_user
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, extensions, pg_temp', f);
  END LOOP;
END $$;

-- Remove anonymous execution from all SECURITY DEFINER functions in public.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_userbyid(p.proowner) = current_user
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f);
  END LOOP;
END $$;
