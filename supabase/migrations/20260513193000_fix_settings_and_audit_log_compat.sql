-- Compatibility hardening for custom app auth + client-side structured logging.
-- Fixes:
-- 1) api-settings 500 when settings table is missing expected newer columns.
-- 2) api-client-log 500 when audit_logs action CHECK is too strict for new action labels.

-- Ensure settings table has all fields expected by api-settings.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS member_id_start INT DEFAULT 1;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS case_id_start INT DEFAULT 1;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mpesa_consumer_key TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mpesa_consumer_secret TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mpesa_passkey TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mpesa_shortcode TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mpesa_initiator_name TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mpesa_initiator_password TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mpesa_env TEXT DEFAULT 'sandbox';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DO $$
BEGIN
  ALTER TABLE public.settings
    ADD CONSTRAINT settings_mpesa_env_check CHECK (mpesa_env IN ('sandbox', 'production'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Ensure audit_logs can store member-scoped app logs and free-form action names.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.members(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Old check limited action to a tiny fixed enum and breaks modern app telemetry actions.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;

-- Keep action required but flexible.
ALTER TABLE public.audit_logs
  ALTER COLUMN action TYPE TEXT,
  ALTER COLUMN action SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_member_id ON public.audit_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
