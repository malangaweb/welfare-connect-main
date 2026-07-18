-- Fix: the cascade bug created a chain of inactivation/reactivation cycles.
-- The waterfall anchors its penalty bucket at the latest auto_inactive
-- transition.  After cleaning stale auto_wallet_reactivation transitions
-- (20260718000700), the latest auto_inactive (from the cascade sweep) has
-- no subsequent reactivation, but the member's penalty payments were made
-- in EARLIER cycles and are excluded.
--
-- Fix: collapse the cascade noise.  For each healed member, keep only the
-- FIRST auto_inactive_two_consecutive_defaults (the legitimate one).  Delete
-- all subsequent auto_inactive and auto_wallet_reactivation transitions
-- created by the cascade feedback loop.
--
-- Then re-run the waterfall.  Members with total_penalty_paid >= 300 and
-- wallet >= case obligations will reactivate.

-- ═══ Part 1: collapse cascade noise for healed members ════════════════

DO $$
DECLARE
  m RECORD;
  v_first_inactive_id UUID;
  v_cutoff TIMESTAMPTZ;
  v_deleted INT;
BEGIN
  FOR m IN
    SELECT DISTINCT t.member_id, mb.member_number
    FROM public.transactions t
    JOIN public.members mb ON mb.id = t.member_id
    WHERE t.metadata->>'source' = 'cascade_bug_refund'
  LOOP
    -- Find the first auto_inactive transition (the legitimate one).
    SELECT id, created_at INTO v_first_inactive_id, v_cutoff
    FROM public.member_status_transitions
    WHERE member_id = m.member_id
      AND reason = 'auto_inactive_two_consecutive_defaults'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_first_inactive_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Delete ALL auto_inactive and auto_wallet_reactivation transitions
    -- AFTER the first one (these are cascade noise).
    DELETE FROM public.member_status_transitions
    WHERE member_id = m.member_id
      AND reason IN ('auto_inactive_two_consecutive_defaults', 'auto_wallet_reactivation')
      AND created_at > v_cutoff;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Member #%: kept first inactive at %, deleted % cascade transitions',
      m.member_number, v_cutoff, v_deleted;
  END LOOP;
END;
$$;

-- ═══ Part 2: run waterfall for all healed members ═══════════════════════

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
