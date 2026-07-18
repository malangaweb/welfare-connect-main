-- Fix probation_end_date for members reactivated before the 90-day fix.
-- Old code used INTERVAL '3 months' (~92 days).  Correct is 90 days.

UPDATE public.members m
SET probation_end_date = sub.correct_end,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (t.member_id)
    t.member_id,
    (t.created_at::DATE + INTERVAL '90 days')::DATE AS correct_end
  FROM public.member_status_transitions t
  WHERE t.reason = 'auto_wallet_reactivation'
  ORDER BY t.member_id, t.created_at DESC
) sub
WHERE m.id = sub.member_id
  AND m.status = 'probation'
  AND m.probation_end_date IS DISTINCT FROM sub.correct_end
RETURNING m.member_number, m.name, m.probation_end_date, sub.correct_end;
