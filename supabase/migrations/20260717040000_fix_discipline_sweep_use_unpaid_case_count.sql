-- The discipline sweep previously checked only
-- member_default_streaks.current_streak >= 2, which misses probation
-- members with 2+ unpaid cases where no case has been finalized yet
-- (the streak counter is only updated on case finalization).
--
-- Fix: use get_member_total_due().unpaid_case_count >= 2 as the primary
-- trigger, falling back to streak >= 2 as a secondary check.
-- Also no longer skip auto-reactivated members — if they have 2+ unpaid
-- cases after reactivation, they need to be disciplined.

CREATE OR REPLACE FUNCTION public.check_and_apply_member_discipline()
RETURNS TABLE (member_id UUID, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  m RECORD;
  v_unpaid_count INT;
  v_streak INT;
  v_waterfall JSONB;
BEGIN
  FOR m IN
    SELECT mm.id, mm.member_number, mm.name, mm.status
    FROM public.members mm
    WHERE mm.status = 'probation'
    ORDER BY mm.member_number
  LOOP
    SELECT COALESCE((
      SELECT ds.current_streak FROM public.member_default_streaks ds WHERE ds.member_id = m.id
    ), 0) INTO v_streak;

    SELECT COALESCE(due.unpaid_case_count, 0)::INT INTO v_unpaid_count
    FROM public.get_member_total_due(m.id) due;

    IF COALESCE(v_streak, 0) < 2 AND COALESCE(v_unpaid_count, 0) < 2 THEN
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
      m.id, 'probation', 'inactive',
      TRUE, FALSE,
      'auto_inactive_two_consecutive_defaults',
      jsonb_build_object(
        'source', 'discipline_sweep',
        'streak', v_streak,
        'unpaid_case_count', v_unpaid_count
      ),
      'system'
    );

    -- Run the wallet waterfall: if the member has wallet balance it will be
    -- applied toward the reinstatement penalty (partial or full). If the
    -- penalty is fully satisfied the member is reactivated to probation.
    v_waterfall := public.apply_wallet_payment_waterfall(m.id);
    IF (v_waterfall->>'status')::TEXT = 'probation' THEN
      member_id := m.id;
      action := 'reactivated_via_waterfall';
      RETURN NEXT;
    ELSE
      member_id := m.id;
      action := 'marked_inactive';
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_and_apply_member_discipline() IS
'Sweeps probation members with >= 2 unpaid cases (get_member_total_due) or member_default_streaks.current_streak >= 2. Marks them inactive.';

GRANT EXECUTE ON FUNCTION public.check_and_apply_member_discipline() TO authenticated, service_role;
