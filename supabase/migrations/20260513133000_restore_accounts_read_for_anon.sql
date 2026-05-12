-- Targeted rollback for UI visibility on Accounts pages:
-- restore read-only access without reopening writes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'accounts'
      AND policyname = 'accounts_public_read'
  ) THEN
    CREATE POLICY accounts_public_read
    ON public.accounts
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;
END $$;

