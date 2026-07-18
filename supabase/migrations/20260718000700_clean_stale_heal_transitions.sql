-- Fix: delete stale auto_wallet_reactivation transitions left by the heal
-- (20260718000200).  These block the open-cycle detection in the waterfall,
-- preventing penalty processing and reactivation for members who have already
-- paid enough.
--
-- Heal-created transitions are identified by being AFTER the cascade bug onset
-- (2026-07-16 20:52:58 UTC, the first cascade penalty).  Any reactivation
-- before that is legitimate and preserved.
--
-- After deleting stale transitions, run the waterfall for members who might
-- now reactivate.

-- ═══ Part 1: delete stale heal transitions ═══════════════════════════════

DELETE FROM public.member_status_transitions t
WHERE t.reason = 'auto_wallet_reactivation'
  AND t.created_at >= '2026-07-16 20:52:58+00'
  AND EXISTS (
    SELECT 1 FROM public.transactions r
    WHERE r.member_id = t.member_id
      AND r.metadata->>'source' = 'cascade_bug_refund'
  );

-- ═══ Part 2: run waterfall for all healed members ═════════════════════════

DO $$
DECLARE
  m RECORD;
  v_result JSONB;
BEGIN
  FOR m IN
    SELECT DISTINCT t.member_id, mb.member_number
    FROM public.transactions t
    JOIN public.members mb ON mb.id = t.member_id
    WHERE t.metadata->>'source' = 'cascade_bug_refund'
    ORDER BY mb.member_number
  LOOP
    v_result := public.apply_wallet_payment_waterfall(m.member_id);
    RAISE NOTICE 'Member #% → %', m.member_number, v_result;
  END LOOP;
END;
$$;

SELECT refresh_all_member_wallet_balances();
