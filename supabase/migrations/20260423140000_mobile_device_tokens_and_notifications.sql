-- Device tokens for Flutter/mobile push notifications

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  member_id UUID NULL,
  role TEXT NOT NULL,
  device_token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'flutter',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON public.device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_member_id ON public.device_tokens(member_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_role ON public.device_tokens(role);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access device_tokens" ON public.device_tokens;
CREATE POLICY "Service role full access device_tokens"
ON public.device_tokens
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.device_tokens IS 'Push notification tokens registered by web/flutter clients.';
