-- Targeted rollback for UI data visibility:
-- Admin transactions page reads directly through PostgREST anon client.
-- Keep writes locked down; restore read-only access.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transactions'
      AND policyname = 'transactions_public_read'
  ) THEN
    CREATE POLICY transactions_public_read
    ON public.transactions
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;
END $$;

