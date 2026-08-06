-- Fix: the discipline "open cycle" guard only recognized 'auto_wallet_reactivation'
-- as closing an auto-inactive cycle. Members reactivated via a
-- 'correction_wrongful_discipline' transition (2026-07-25 remediation) were
-- therefore permanently skipped by check_and_apply_member_discipline() and
-- check_member_discipline() — even when they accumulated >= 2 unpaid finalized
-- cases afterwards. Treat 'correction_wrongful_discipline' as a cycle closer too.

CREATE OR REPLACE FUNCTION public.check_and_apply_member_discipline()
 RETURNS TABLE(member_id uuid, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- Open cycle: the latest auto_inactive has no later closing transition.
    -- A later 'auto_wallet_reactivation' (wallet waterfall) or
    -- 'correction_wrongful_discipline' (wrongful-inactivation remediation)
    -- both close the cycle so the member is re-evaluated on new defaults.
    SELECT BOOL_OR(TRUE)
      INTO v_open_cycle
    FROM public.member_status_transitions t
    WHERE t.member_id = m.id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1 FROM public.member_status_transitions later
        WHERE later.member_id = m.id
          AND later.reason IN ('auto_wallet_reactivation', 'correction_wrongful_discipline')
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
$function$;

CREATE OR REPLACE FUNCTION public.check_member_discipline(p_member_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_streak INT := 0;
  v_reactivated_at TIMESTAMPTZ;
  v_open_cycle BOOLEAN := FALSE;
  v_unpaid_finalized_count INT := 0;
BEGIN
  SELECT status INTO v_status
  FROM public.members
  WHERE id = p_member_id
    AND status IN ('probation', 'active')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Latest auto_wallet_reactivation (if any).
  SELECT MAX(t.created_at) FILTER (WHERE t.reason = 'auto_wallet_reactivation')
    INTO v_reactivated_at
  FROM public.member_status_transitions t
  WHERE t.member_id = p_member_id;

  -- Open cycle: the latest auto_inactive has no later closing transition.
  -- Treat 'correction_wrongful_discipline' (wrongful-inactivation remediation)
  -- the same as 'auto_wallet_reactivation' for closing the cycle.
  SELECT EXISTS(
    SELECT 1
    FROM public.member_status_transitions t
    WHERE t.member_id = p_member_id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1 FROM public.member_status_transitions later
        WHERE later.member_id = p_member_id
          AND later.reason IN ('auto_wallet_reactivation', 'correction_wrongful_discipline')
          AND later.created_at > t.created_at
      )
  ) INTO v_open_cycle;

  IF v_open_cycle THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(ds.current_streak, 0) INTO v_streak
  FROM public.member_default_streaks ds
  WHERE ds.member_id = p_member_id;

  -- Count unpaid FINALIZED cases only (same logic as the full sweep).
  -- When the member was reactivated, only cases created AFTER the reactivation
  -- count as fresh defaults. Pre-reactivation defaults are settled by the
  -- reinstatement penalty.
  SELECT COUNT(*)::INT INTO v_unpaid_finalized_count
  FROM (
    SELECT c.id
    FROM public.cases c
    WHERE c.is_finalized = TRUE
      AND public.member_case_obligation_applies(p_member_id, c.id)
      AND (v_reactivated_at IS NULL OR c.created_at > v_reactivated_at)
      AND COALESCE((
        SELECT SUM(
          CASE
            WHEN t2.transaction_type IN ('contribution','case_wallet_deduction','arrears') THEN ABS(COALESCE(t2.amount,0))
            WHEN t2.transaction_type IN ('contribution_refund','case_wallet_refund') THEN -ABS(COALESCE(t2.amount,0))
            ELSE 0
          END
        )::NUMERIC
        FROM public.transactions t2
        WHERE t2.member_id = p_member_id AND t2.case_id = c.id
          AND t2.transaction_type IN ('contribution','case_wallet_deduction','arrears','contribution_refund','case_wallet_refund')
          AND COALESCE(LOWER(t2.status),'completed') IN ('completed','success')
      ), 0) < COALESCE(c.contribution_per_member, 0) - 0.009
  ) ob;

  IF COALESCE(v_streak, 0) < 2 AND COALESCE(v_unpaid_finalized_count, 0) < 2 THEN
    RETURN NULL;
  END IF;

  UPDATE public.members
  SET status = 'inactive', is_active = FALSE, updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO public.member_status_transitions (
    member_id, from_status, to_status, from_is_active, to_is_active,
    reason, details, performed_by_role
  ) VALUES (
    p_member_id, v_status, 'inactive', TRUE, FALSE,
    'auto_inactive_two_consecutive_defaults',
    jsonb_build_object(
      'source', 'discipline_scoped_trigger',
      'streak', v_streak,
      'unpaid_finalized_count', v_unpaid_finalized_count
    ),
    'system'
  );

  RETURN 'marked_inactive';
END;
$$;
