-- Allow authenticated/anonymous users to read sms_templates (no sensitive data)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow read sms_templates' AND tablename = 'sms_templates'
  ) THEN
    CREATE POLICY "Allow read sms_templates" ON public.sms_templates FOR SELECT USING (true);
  END IF;
END $$;

-- Ensure anonymous can also read (for public member portal if needed)
GRANT SELECT ON public.sms_templates TO anon;
