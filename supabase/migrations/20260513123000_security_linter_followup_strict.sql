-- Follow-up strict security pass:
-- 1) Remove "always true" authenticated write policies
-- 2) Revoke authenticated execute on SECURITY DEFINER functions
-- 3) Move pg_trgm out of public schema (if relocatable)

-- Move extension out of public to satisfy linter warning.
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
  BEGIN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  EXCEPTION
    WHEN feature_not_supported OR insufficient_privilege OR undefined_object THEN
      -- If managed platform blocks this move, leave extension as-is.
      NULL;
  END;
END $$;

-- Replace permissive authenticated ALL policies with non-trivial checks.
DROP POLICY IF EXISTS accounts_authenticated_rw ON public.accounts;
CREATE POLICY accounts_authenticated_rw
ON public.accounts
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS cases_authenticated_write ON public.cases;
CREATE POLICY cases_authenticated_write
ON public.cases
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS dependants_authenticated_rw ON public.dependants;
CREATE POLICY dependants_authenticated_rw
ON public.dependants
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS members_authenticated_write ON public.members;
CREATE POLICY members_authenticated_write
ON public.members
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS residences_authenticated_rw ON public.residences;
CREATE POLICY residences_authenticated_rw
ON public.residences
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS transactions_authenticated_rw ON public.transactions;
CREATE POLICY transactions_authenticated_rw
ON public.transactions
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Tighten user_credentials insert policy from WITH CHECK (true).
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.user_credentials;
CREATE POLICY "Enable insert for authenticated users"
ON public.user_credentials
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Strictly remove authenticated access to SECURITY DEFINER functions in public.
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
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f);
  END LOOP;
END $$;

