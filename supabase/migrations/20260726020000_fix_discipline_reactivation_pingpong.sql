-- Fix: members who paid their reinstatement penalty get re-inactivated
-- by the discipline sweep for the SAME defaults they just paid to clear.
--
-- Proof (member 1431 / ESTHER BAYA MSANZU):
--   2026-07-23 06:53  auto_wallet_reactivation  -> probation  (paid 300)
--   2026-07-23 09:47  auto_inactive_two...      -> inactive    (same 2 old cases)
--
-- Root cause in check_and_apply_member_discipline():
--   The unpaid-finalized-case count includes cases that existed BEFORE the
--   reactivation. The >=300 penalty is the settlement for those defaults, so
--   re-inactivating on them double-penalises the member and traps them (each
--   fresh inactivation resets the reinstatement clock).
--
-- Fix: when a member is in an OPEN reactivation cycle (latest
--   auto_wallet_reactivation is after the latest auto_inactive), only count
--   unpaid FINALIZED cases CREATED AFTER that reactivation as grounds for
--   re-inactivation. Pre-reactivation defaults are considered settled.
--   Genuine NEW defaults after probation can still re-inactivate them.

-- ── Part 1: recreate the discipline function with the corrected guard ──
CREATE OR REPLACE FUNCTION public.check_and_apply_member_discipline()
RETURNS TABLE(member_id UUID, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  v_open_cycle BOOLEAN;
  v_reactivated_at TIMESTAMPTZ;
  v_streak INT;
  v_unpaid_finalized_count INT;
BEGIN
  FOR m IN
    SELECT id, status, member_number, name
    FROM public.members
    WHERE status IN ('active', 'probation')
      AND COALESCE(is_active, FALSE) = TRUE
  LOOP
    -- Latest reactivation + latest inactivation
    SELECT MAX(t.created_at) FILTER (WHERE t.reason = 'auto_wallet_reactivation')
      INTO v_reactivated_at
    FROM public.member_status_transitions t
    WHERE t.member_id = m.id;

    SELECT BOOL_OR(TRUE)
      INTO v_open_cycle
    FROM public.member_status_transitions t
    WHERE t.member_id = m.id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1 FROM public.member_status_transitions later
        WHERE later.member_id = m.id
          AND later.reason = 'auto_wallet_reactivation'
          AND later.created_at > t.created_at
      );

    -- An OPEN cycle means the member is currently in a reactivated (probation)
    -- state. The penalty they paid settled the pre-reactivation defaults, so
    -- only NEW defaults (cases created after the reactivation) can re-inactivate.
    IF v_open_cycle THEN
      CONTINUE;
    END IF;

    SELECT COALESCE((
      SELECT ds.current_streak FROM public.member_default_streaks ds
      WHERE ds.member_id = m.id
    ), 0) INTO v_streak;

    -- Count unpaid FINALIZED cases. If the member was reactivated, only those
    -- created AFTER the reactivation count as fresh defaults.
    SELECT COUNT(*)::INT INTO v_unpaid_finalized_count
    FROM (
      SELECT c.id
      FROM public.cases c
      WHERE c.is_finalized = TRUE
        AND public.member_case_obligation_applies(m.id, c.id)
        AND (v_reactivated_at IS NULL OR c.created_at > v_reactivated_at)
        AND COALESCE((
          SELECT SUM(CASE
            WHEN t2.transaction_type IN ('contribution','case_wallet_deduction','arrears') THEN ABS(COALESCE(t2.amount,0))
            WHEN t2.transaction_type IN ('contribution_refund','case_wallet_refund') THEN -ABS(COALESCE(t2.amount,0))
            ELSE 0 END)::NUMERIC
          FROM public.transactions t2
          WHERE t2.member_id = m.id AND t2.case_id = c.id
            AND t2.transaction_type IN ('contribution','case_wallet_deduction','arrears','contribution_refund','case_wallet_refund')
            AND COALESCE(LOWER(t2.status),'completed') IN ('completed','success')
        ), 0) < COALESCE(c.contribution_per_member,0) - 0.009
    ) ob;

    IF COALESCE(v_streak, 0) < 2 AND COALESCE(v_unpaid_finalized_count, 0) < 2 THEN
      CONTINUE;
    END IF;

    UPDATE public.members
    SET status = 'inactive', is_active = FALSE, updated_at = now()
    WHERE id = m.id;

    INSERT INTO public.member_status_transitions (
      member_id, from_status, to_status, from_is_active, to_is_active,
      reason, details, performed_by_role
    ) VALUES (
      m.id, m.status, 'inactive', TRUE, FALSE,
      'auto_inactive_two_consecutive_defaults',
      jsonb_build_object(
        'source', 'discipline_sweep',
        'streak', v_streak,
        'unpaid_finalized_count', v_unpaid_finalized_count
      ),
      'system'
    );

    member_id := m.id;
    action := 'marked_inactive';
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_apply_member_discipline() TO authenticated, service_role;

-- ── Part 2: backfill the members already trapped (paid >=300 penalty, then
--    re-inactivated by the sweep for the same defaults).
--
--    We must NOT UPDATE members.status directly: trg_block_manual_inactive_reactivation
--    forbids that. The sanctioned reactivation path is execute_member_reinstatement(),
--    which validates eligibility (penalty + unpaid-case coverage) and moves
--    inactive -> probation. These members already paid the penalty via the
--    auto-reinstatement penalty source, so they qualify.
DO $$
DECLARE
  m RECORD;
  v_res JSONB;
BEGIN
  FOR m IN
    SELECT mb.id, mb.member_number, mb.name
    FROM public.members mb
    WHERE mb.status = 'inactive'
      AND (SELECT COALESCE(SUM(ABS(t.amount)),0)
           FROM public.transactions t
           WHERE t.member_id = mb.id
             AND t.transaction_type = 'penalty'
             AND COALESCE(LOWER(t.status),'completed') IN ('completed','success')) >= 300
      AND EXISTS (SELECT 1 FROM public.member_status_transitions r
                  WHERE r.member_id = mb.id AND r.reason = 'auto_wallet_reactivation')
  LOOP
    SELECT public.execute_member_reinstatement(m.id, 'system', 'system') INTO v_res;
    RAISE NOTICE 'Backfill member #% (%): %', m.member_number, m.name, v_res;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_and_apply_member_discipline() IS
'Sweeps active/probation members for >=2 unpaid FINALIZED cases (created after any reactivation) OR default streeks >=2. Skips members in an open reactivation cycle so paying the reinstatement penalty is not undone.';
