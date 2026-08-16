-- Streak rule: inactivate on 2 CONSECUTIVE currently-UNPAID cases.
--
-- Old rule: a case was a "default" if unpaid at its OWN finalization and that
-- status was frozen forever in case_defaulters (and member_default_streaks).
-- This double-punishes members who pay late but BEFORE the next case
-- finalizes. Proof (member 345 / KARISA CHARO THUVA): C054 paid 2026-08-12,
-- C055 finalised 2026-08-15 17:03 — C054 was fully settled first, yet the old
-- rule still counted C054+C055 as "2 consecutive defaults" and inactivated
-- the member.
--
-- New rule: a case is "unpaid" iff net_paid < contribution (dynamic, current
-- state — paying removes it). A member is inactivated iff they currently have
-- 2 consecutive finalized cases (in obligation order) that are BOTH unpaid.
-- Replaces the reliance on the frozen case_defaulters / stale streak counter
-- across all three discipline paths. GOING FORWARD ONLY — no historical state
-- is rewritten here.
--
-- One nuance carried over from the existing rules: cases created BEFORE the
-- member's most recent auto_wallet_reactivation are considered settled by the
-- reinstatement penalty they paid, so they never count in the run again.
-- This is enforced inside get_max_consecutive_unpaid_cases() so all three
-- callers behave identically.

-- ── Shared helper: longest run of consecutive currently-unpaid cases ────────
CREATE OR REPLACE FUNCTION public.get_max_consecutive_unpaid_cases(p_member_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case RECORD;
  v_paid NUMERIC;
  v_reactivated_at TIMESTAMPTZ;
  v_current_run INT := 0;
  v_max_run INT := 0;
BEGIN
  -- Pre-reactivation cases were settled by the reinstatement penalty.
  SELECT MAX(t.created_at)
    INTO v_reactivated_at
  FROM public.member_status_transitions t
  WHERE t.member_id = p_member_id
    AND t.reason = 'auto_wallet_reactivation';

  FOR v_case IN
    SELECT c.id, COALESCE(c.contribution_per_member, 0) AS required_amount
    FROM public.cases c
    WHERE c.is_finalized = TRUE
      AND public.member_case_obligation_applies(p_member_id, c.id)
      AND (v_reactivated_at IS NULL OR c.created_at > v_reactivated_at)
    ORDER BY c.created_at, c.id
  LOOP
    SELECT COALESCE(SUM(CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(COALESCE(t.amount, 0))
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(COALESCE(t.amount, 0))
        ELSE 0 END)::NUMERIC, 0)
    INTO v_paid
    FROM public.transactions t
    WHERE t.member_id = p_member_id
      AND t.case_id = v_case.id
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success');

    IF v_paid >= v_case.required_amount - 0.009 THEN
      v_current_run := 0;          -- fully paid case breaks the run
    ELSE
      v_current_run := v_current_run + 1;
      IF v_current_run > v_max_run THEN
        v_max_run := v_current_run;
      END IF;
    END IF;
  END LOOP;

  RETURN v_max_run;
END;
$$;

COMMENT ON FUNCTION public.get_max_consecutive_unpaid_cases(UUID) IS
'Longest run of consecutive finalized cases (in the member obligation sequence) that are currently unpaid (net_paid < contribution). Cases created before the last auto_wallet_reactivation are settled by the reinstatement penalty and excluded. Used to inactivate on 2+ consecutive unpaid cases.';

GRANT EXECUTE ON FUNCTION public.get_max_consecutive_unpaid_cases(UUID) TO authenticated, service_role;

-- ── Shared guard: is the member in an open (unresolved) auto-inactive cycle? ──
-- True when the latest auto_inactive has no later closing transition
-- (auto_wallet_reactivation or correction_wrongful_discipline). An open cycle
-- means the member was restored recently; let the restoration stand and do not
-- immediately re-inactivate on pre-existing defaults.
CREATE OR REPLACE FUNCTION public.member_has_open_auto_inactive_cycle(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.member_status_transitions t
    WHERE t.member_id = p_member_id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1
        FROM public.member_status_transitions later
        WHERE later.member_id = p_member_id
          AND later.reason IN ('auto_wallet_reactivation', 'correction_wrongful_discipline')
          AND later.created_at > t.created_at
      )
  )
$$;

COMMENT ON FUNCTION public.member_has_open_auto_inactive_cycle(UUID) IS
'True if the member has an auto-inactive transition with no later closing transition (auto_wallet_reactivation or correction_wrongful_discipline).';

GRANT EXECUTE ON FUNCTION public.member_has_open_auto_inactive_cycle(UUID) TO authenticated, service_role;

-- ── 1) Case-finalise trigger ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_member_discipline_on_case_finalize()
RETURNS TRIGGER AS $$
DECLARE
  m RECORD;
  v_defaulted BOOLEAN;
  v_streak INT;
  v_paid NUMERIC;
BEGIN
  IF NEW.is_finalized IS TRUE AND COALESCE(OLD.is_finalized, FALSE) IS DISTINCT FROM TRUE THEN
    FOR m IN
      SELECT id, status, is_active
      FROM public.members
      WHERE status <> 'deceased'
        AND public.member_case_obligation_applies(id, NEW.id)
    LOOP
      SELECT COALESCE(SUM(CASE
          WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(COALESCE(t.amount, 0))
          WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(COALESCE(t.amount, 0))
          ELSE 0 END)::NUMERIC, 0)
      INTO v_paid
      FROM public.transactions t
      WHERE t.member_id = m.id
        AND t.case_id = NEW.id
        AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success');

      v_defaulted := v_paid < COALESCE(NEW.contribution_per_member, 0) - 0.009;

      -- Skip members in an open (recently restored) auto-inactive cycle so we
      -- do not override a pending correction / reinstatement.
      IF public.member_has_open_auto_inactive_cycle(m.id) THEN
        CONTINUE;
      END IF;

      v_streak := public.get_max_consecutive_unpaid_cases(m.id);

      INSERT INTO public.member_default_streaks (member_id, current_streak, last_case_id, last_defaulted, updated_at)
      VALUES (m.id, v_streak, NEW.id, v_defaulted, now())
      ON CONFLICT (member_id)
      DO UPDATE SET
        current_streak = EXCLUDED.current_streak,
        last_case_id = EXCLUDED.last_case_id,
        last_defaulted = EXCLUDED.last_defaulted,
        updated_at = now();

      IF v_streak >= 2 AND m.status IN ('active', 'probation') THEN
        UPDATE public.members
        SET status = 'inactive',
            is_active = FALSE,
            updated_at = now()
        WHERE id = m.id;

        INSERT INTO public.member_status_transitions (
          member_id, from_status, to_status, from_is_active, to_is_active,
          reason, details, performed_by_role
        ) VALUES (
          m.id, m.status, 'inactive', m.is_active, FALSE,
          'auto_inactive_two_consecutive_defaults',
          jsonb_build_object(
            'case_id', NEW.id,
            'case_number', NEW.case_number,
            'streak', v_streak,
            'source', 'consecutive_unpaid_rule'
          ),
          'system'
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.apply_member_discipline_on_case_finalize() IS
'When a case is finalized, recomputes each obligated member''s run of consecutive currently-unpaid finalized cases and auto-inactivates at >= 2. A case paid before the next case finalizes is removed from the run.';

GRANT EXECUTE ON FUNCTION public.apply_member_discipline_on_case_finalize() TO authenticated, service_role;

-- ── 2) Member-scoped discipline check (transaction trigger path) ────────────
CREATE OR REPLACE FUNCTION public.check_member_discipline(p_member_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_streak INT;
BEGIN
  -- Serialize per-member and only act on active/probation members.
  SELECT status INTO v_status
  FROM public.members
  WHERE id = p_member_id
    AND status IN ('probation', 'active')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Skip members with an open (unresolved) auto-inactive cycle.
  IF public.member_has_open_auto_inactive_cycle(p_member_id) THEN
    RETURN NULL;
  END IF;

  v_streak := public.get_max_consecutive_unpaid_cases(p_member_id);

  IF v_streak < 2 THEN
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
    p_member_id, v_status, 'inactive', TRUE, FALSE,
    'auto_inactive_two_consecutive_defaults',
    jsonb_build_object(
      'source', 'discipline_scoped_trigger',
      'streak', v_streak
    ),
    'system'
  );

  RETURN 'marked_inactive';
END;
$$;

COMMENT ON FUNCTION public.check_member_discipline(UUID) IS
'Evaluates a single member against the consecutive-unpaid rule; marks inactive if they currently have 2 consecutive unpaid finalized cases.';

GRANT EXECUTE ON FUNCTION public.check_member_discipline(UUID) TO authenticated, service_role;

-- ── 3) Full discipline sweep (scheduled / manual) ───────────────────────────
CREATE OR REPLACE FUNCTION public.check_and_apply_member_discipline()
RETURNS TABLE(member_id UUID, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  v_streak INT;
BEGIN
  FOR m IN
    SELECT id, status, member_number, name
    FROM public.members
    WHERE status IN ('active', 'probation')
      AND COALESCE(is_active, FALSE) = TRUE
  LOOP
    -- Respect an open auto-inactive cycle (recent restoration in progress).
    IF public.member_has_open_auto_inactive_cycle(m.id) THEN
      CONTINUE;
    END IF;

    v_streak := public.get_max_consecutive_unpaid_cases(m.id);

    IF v_streak < 2 THEN
      CONTINUE;
    END IF;

    UPDATE public.members
    SET status = 'inactive',
        is_active = FALSE,
        updated_at = now()
    WHERE id = m.id;

    INSERT INTO public.member_status_transitions (
      member_id, from_status, to_status, from_is_active, to_is_active,
      reason, details, performed_by_role
    ) VALUES (
      m.id, m.status, 'inactive', TRUE, FALSE,
      'auto_inactive_two_consecutive_defaults',
      jsonb_build_object(
        'source', 'discipline_sweep',
        'streak', v_streak
      ),
      'system'
    );

    member_id := m.id;
    action := 'marked_inactive';
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_and_apply_member_discipline() IS
'Sweeps active/probation members and marks inactive any that currently have 2 consecutive unpaid finalized cases. Skips members in an open reactivation cycle.';

GRANT EXECUTE ON FUNCTION public.check_and_apply_member_discipline() TO authenticated, service_role;