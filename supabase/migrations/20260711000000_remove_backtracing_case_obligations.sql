-- Remove backtracing of case obligations for new members.
-- Members should only owe for cases that started on/after their registration date.
-- Pre-existing active cases (started before the member joined) are excluded.
-- Probation logic is unchanged.

-- 1) member_case_obligation_applies — now checks case start date for ALL payable cases
CREATE OR REPLACE FUNCTION public.member_case_obligation_applies(
  p_member_id UUID,
  p_case_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_member_start DATE;
  v_case_is_active BOOLEAN;
  v_case_is_finalized BOOLEAN;
  v_case_effective_start DATE;
BEGIN
  SELECT COALESCE(m.registration_date, m.created_at::DATE, CURRENT_DATE)
  INTO v_member_start
  FROM public.members m
  WHERE m.id = p_member_id;

  IF v_member_start IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(c.is_active, FALSE), COALESCE(c.is_finalized, FALSE),
         COALESCE(c.start_date, c.created_at::DATE)
  INTO v_case_is_active, v_case_is_finalized, v_case_effective_start
  FROM public.cases c
  WHERE c.id = p_case_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF NOT v_case_is_active AND NOT v_case_is_finalized THEN
    RETURN FALSE;
  END IF;

  RETURN v_case_effective_start >= v_member_start;
END;
$$;

COMMENT ON FUNCTION public.member_case_obligation_applies(UUID, UUID) IS
'Returns true when a case should count as payable for a member, excluding cases that started before the member was registered.';

GRANT EXECUTE ON FUNCTION public.member_case_obligation_applies(UUID, UUID) TO anon, authenticated, service_role;

-- 2) record_case_defaulters_on_finalize — only defaulter members the case applies to
CREATE OR REPLACE FUNCTION public.record_case_defaulters_on_finalize()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_finalized IS TRUE AND COALESCE(OLD.is_finalized, FALSE) IS DISTINCT FROM TRUE THEN
    INSERT INTO case_defaulters (case_id, member_id)
    SELECT NEW.id, m.id
    FROM members m
    WHERE m.is_active = true
      AND m.status IN ('active', 'probation')
      AND public.member_case_obligation_applies(m.id, NEW.id)
      AND NOT EXISTS (
        SELECT 1
        FROM transactions t
        WHERE t.member_id = m.id
          AND t.case_id = NEW.id
          AND t.transaction_type IN ('contribution', 'case_wallet_deduction')
          AND COALESCE(t.status, 'completed') = 'completed'
      )
    ON CONFLICT (case_id, member_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_case_defaulters_on_finalize() IS
'Records active/probation members who have not paid a finalized case, scoped to members the case obligation applies to.';

-- 3) apply_member_discipline_on_case_finalize — skip members the case doesn't apply to
CREATE OR REPLACE FUNCTION public.apply_member_discipline_on_case_finalize()
RETURNS TRIGGER AS $$
DECLARE
  m RECORD;
  v_prev_streak INT;
  v_last_case_id UUID;
  v_defaulted BOOLEAN;
  v_new_streak INT;
BEGIN
  IF NEW.is_finalized IS TRUE AND COALESCE(OLD.is_finalized, FALSE) IS DISTINCT FROM TRUE THEN
    FOR m IN
      SELECT id, status, is_active
      FROM members
      WHERE status <> 'deceased'
        AND public.member_case_obligation_applies(id, NEW.id)
    LOOP
      SELECT s.current_streak, s.last_case_id
      INTO v_prev_streak, v_last_case_id
      FROM member_default_streaks s
      WHERE s.member_id = m.id;

      IF v_last_case_id = NEW.id THEN
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM case_defaulters d
        WHERE d.case_id = NEW.id
          AND d.member_id = m.id
      ) INTO v_defaulted;

      v_new_streak := CASE
        WHEN v_defaulted THEN COALESCE(v_prev_streak, 0) + 1
        ELSE 0
      END;

      INSERT INTO member_default_streaks (member_id, current_streak, last_case_id, last_defaulted, updated_at)
      VALUES (m.id, v_new_streak, NEW.id, v_defaulted, now())
      ON CONFLICT (member_id)
      DO UPDATE SET
        current_streak = EXCLUDED.current_streak,
        last_case_id = EXCLUDED.last_case_id,
        last_defaulted = EXCLUDED.last_defaulted,
        updated_at = now();

      IF v_new_streak >= 2 AND m.status IN ('active', 'probation') THEN
        UPDATE members
        SET status = 'inactive',
            is_active = FALSE,
            updated_at = now()
        WHERE id = m.id;

        INSERT INTO member_status_transitions (
          member_id,
          from_status,
          to_status,
          from_is_active,
          to_is_active,
          reason,
          details,
          performed_by_role
        ) VALUES (
          m.id,
          m.status,
          'inactive',
          m.is_active,
          FALSE,
          'auto_inactive_two_consecutive_defaults',
          jsonb_build_object(
            'case_id', NEW.id,
            'case_number', NEW.case_number,
            'streak', v_new_streak
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
'When a case is finalized, updates member default streaks and auto-inactivates at streak >= 2, scoped to members the case obligation applies to.';
