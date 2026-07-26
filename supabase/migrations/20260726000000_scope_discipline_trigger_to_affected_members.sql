-- Perf: stop the per-insert full-table discipline sweep.
--
-- Problem: zz_trg_check_discipline_after_transaction ran
-- check_and_apply_member_discipline() — a scan of EVERY active/probation
-- member — on EVERY transaction insert. That is O(members) work per write and
-- becomes the primary write-throughput bottleneck as membership grows.
--
-- Fix:
--   1. Add check_member_discipline(p_member_id) — the same rules the sweep
--      applies, but scoped to a single member.
--   2. Rewrite the AFTER INSERT trigger to a statement-level trigger with a
--      REFERENCING NEW TABLE, iterating only the DISTINCT members actually
--      touched by the inserted rows.
--
-- The full sweep function is retained for scheduled/cron use and manual runs.
--
-- IMPORTANT operational note: because the trigger no longer sweeps ALL members
-- on every write, a member who newly enters default purely from a NEW CASE
-- (without themselves transacting) is not caught until their next transaction.
-- Schedule the full sweep to run daily to cover that gap, e.g. with pg_cron:
--
--   SELECT cron.schedule('daily-discipline-sweep', '0 2 * * *',
--     $$ SELECT public.check_and_apply_member_discipline(); $$);
--
-- or invoke check_and_apply_member_discipline() from an external scheduler /
-- Supabase scheduled Edge Function once per day.

-- ── Part 1: member-scoped discipline check ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_member_discipline(p_member_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_unpaid_count INT := 0;
  v_streak INT := 0;
  v_open_cycle BOOLEAN := FALSE;
BEGIN
  -- Serialize per-member and only act on active/probation members.
  SELECT status INTO v_status
  FROM public.members
  WHERE id = p_member_id
    AND status IN ('probation', 'active')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;  -- member absent or not in a disciplinable status
  END IF;

  -- Skip members with an open (unresolved) auto-inactive cycle.
  SELECT EXISTS(
    SELECT 1
    FROM public.member_status_transitions t
    WHERE t.member_id = p_member_id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1
        FROM public.member_status_transitions later
        WHERE later.member_id = p_member_id
          AND later.reason = 'auto_wallet_reactivation'
          AND later.created_at > t.created_at
      )
  ) INTO v_open_cycle;

  IF v_open_cycle THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE((
    SELECT ds.current_streak FROM public.member_default_streaks ds WHERE ds.member_id = p_member_id
  ), 0) INTO v_streak;

  SELECT COALESCE(due.unpaid_case_count, 0)::INT INTO v_unpaid_count
  FROM public.get_member_total_due(p_member_id) due;

  IF COALESCE(v_streak, 0) < 2 AND COALESCE(v_unpaid_count, 0) < 2 THEN
    RETURN NULL;
  END IF;

  UPDATE public.members
  SET status = 'inactive',
      is_active = FALSE,
      updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO public.member_status_transitions (
    member_id, from_status, to_status, from_is_active, to_is_active,
    reason, details, performed_by_role
  ) VALUES (
    p_member_id, v_status, 'inactive',
    TRUE, FALSE,
    'auto_inactive_two_consecutive_defaults',
    jsonb_build_object(
      'source', 'discipline_scoped_trigger',
      'streak', v_streak,
      'unpaid_case_count', v_unpaid_count
    ),
    'system'
  );

  RETURN 'marked_inactive';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_member_discipline(UUID) TO authenticated, service_role;

-- ── Part 2: rewrite the trigger to be scoped to affected members ───────────
DROP TRIGGER IF EXISTS zz_trg_check_discipline_after_transaction ON public.transactions;

CREATE OR REPLACE FUNCTION public.trg_check_discipline_after_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m UUID;
BEGIN
  -- Skip recursive sweep when a wallet waterfall is mid-execution.
  IF COALESCE(current_setting('app.auto_wallet_reactivation', TRUE), 'false') = 'true' THEN
    RETURN NULL;
  END IF;

  -- Only evaluate members actually touched by this statement's inserts.
  FOR m IN
    SELECT DISTINCT member_id
    FROM new_transactions
    WHERE member_id IS NOT NULL
  LOOP
    PERFORM public.check_member_discipline(m);
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE TRIGGER zz_trg_check_discipline_after_transaction
  AFTER INSERT ON public.transactions
  REFERENCING NEW TABLE AS new_transactions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_check_discipline_after_transaction();

COMMENT ON FUNCTION public.trg_check_discipline_after_transaction() IS
'Scoped discipline check: evaluates only members whose transactions were inserted by the triggering statement (via REFERENCING NEW TABLE), instead of sweeping all members. Full sweep remains available via check_and_apply_member_discipline().';
