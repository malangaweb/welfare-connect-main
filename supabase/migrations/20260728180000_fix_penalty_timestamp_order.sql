-- The re-inactivation migration (20260728170000) created a new inactivation
-- transition at ~17:00, which is AFTER the 60 penalty was charged at 16:01
-- by the shortfall fix (20260728160000).  get_member_total_due filters
-- penalties by created_at >= latest_inactivation, so the 60 was excluded
-- and penalty_due stayed at 300 instead of 240.
--
-- Fix: shift the re-inactivation transition created_at to just before the
-- penalty, so the penalty falls within the counting window.

UPDATE public.member_status_transitions
SET created_at = '2026-07-28T15:59:00+00:00'::TIMESTAMPTZ
WHERE reason = 'auto_inactive_two_consecutive_defaults'
  AND details->>'source' = 'repair_reinactivation_penalty_shortfall';
