-- Schedule daily probation auto-activation (fixes overdue probation drift, e.g. 1463/474).
-- Run via: supabase db push (requires pg_cron enabled on the project).
-- If pg_cron is unavailable, invoke edge function update-probation-status daily
-- from Supabase Scheduled Functions / an external scheduler instead.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Re-create idempotently
SELECT cron.unschedule('daily-probation-auto-update')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-probation-auto-update');

SELECT cron.schedule(
  'daily-probation-auto-update',
  '15 2 * * *',
  $$ SELECT public.auto_update_probation_status(); $$
);
