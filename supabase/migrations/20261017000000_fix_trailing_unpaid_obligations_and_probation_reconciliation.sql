-- Fix stale unpaid-case reporting and make probation auto-activation auditable.
--
-- An old unpaid case must not remain in the current arrears/default view after
-- a later case has been fully paid. The current unpaid run is calculated from
-- newest to oldest and stops at the first fully paid applicable case.

CREATE OR REPLACE FUNCTION public.get_member_unpaid_case_obligations(p_member_id UUID)
RETURNS TABLE(
  case_id UUID,
  case_number TEXT,
  contribution_per_member NUMERIC,
  case_status TEXT,
  case_date DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case RECORD;
  v_paid NUMERIC;
BEGIN
  FOR v_case IN
    SELECT
      c.id,
      c.case_number,
      COALESCE(c.contribution_per_member, 0)::NUMERIC AS contribution_per_member,
      CASE
        WHEN c.is_finalized THEN 'closed'
        WHEN c.is_active THEN 'active'
        ELSE 'other'
      END::TEXT AS case_status,
      COALESCE(c.end_date, c.start_date, c.created_at::DATE) AS case_date
    FROM public.cases c
    WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
      AND public.member_case_obligation_applies(p_member_id, c.id)
    ORDER BY COALESCE(c.end_date, c.start_date, c.created_at::DATE) DESC,
             c.created_at DESC,
             c.id DESC
  LOOP
    SELECT COALESCE(SUM(CASE
      WHEN t.transaction_type IN (
        'contribution', 'case_wallet_deduction', 'arrears', 'late_payment'
      ) THEN ABS(COALESCE(t.amount, 0))
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund')
        THEN -ABS(COALESCE(t.amount, 0))
      ELSE 0
    END), 0)
    INTO v_paid
    FROM public.transactions t
    WHERE t.member_id = p_member_id
      AND t.case_id = v_case.id
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success');

    -- A fully paid newer case closes the current unpaid run. Older unpaid
    -- cases remain historical ledger facts, but are not current obligations.
    IF v_paid >= v_case.contribution_per_member - 0.009 THEN
      EXIT;
    END IF;

    case_id := v_case.id;
    case_number := v_case.case_number;
    contribution_per_member := v_case.contribution_per_member;
    case_status := v_case.case_status;
    case_date := v_case.case_date;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.get_member_unpaid_case_obligations(UUID) IS
'Returns only the current trailing run of unpaid applicable cases. A fully paid newer case closes the run; older unpaid cases remain historical ledger facts.';

GRANT EXECUTE ON FUNCTION public.get_member_unpaid_case_obligations(UUID)
  TO anon, authenticated, service_role;

-- Ensure future probation completion clears the date and records the status
-- transition. The previous function wrote only a generic aggregate audit row.
CREATE OR REPLACE FUNCTION public.auto_update_probation_status()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_updated_count INT := 0;
BEGIN
  FOR v_member IN
    SELECT id, name, status, is_active, probation_end_date
    FROM public.members
    WHERE status = 'probation'
      AND probation_end_date <= CURRENT_DATE
    FOR UPDATE
  LOOP
    UPDATE public.members
    SET status = 'active',
        is_active = TRUE,
        probation_end_date = NULL,
        updated_at = NOW()
    WHERE id = v_member.id;

    INSERT INTO public.member_status_transitions (
      member_id, from_status, to_status, from_is_active, to_is_active,
      reason, details, performed_by_role
    ) VALUES (
      v_member.id, v_member.status, 'active', v_member.is_active, TRUE,
      'probation_auto_update',
      jsonb_build_object(
        'source', 'auto_update_probation_status',
        'previous_probation_end_date', v_member.probation_end_date
      ),
      'system'
    );

    INSERT INTO public.notifications (
      member_id, role, title, message, category, data
    ) VALUES (
      v_member.id,
      'member',
      'Mwanachama Kamili',
      'Hongera ' || COALESCE(NULLIF(TRIM(v_member.name), ''), 'Mwanachama') ||
        '! Muda wako wa majaribio umeisha na sasa wewe ni mwanachama kamili wa Malanga Welfare.',
      'probation_completed',
      jsonb_build_object('source', 'auto_update_probation_status')
    );

    v_updated_count := v_updated_count + 1;
  END LOOP;

  IF v_updated_count > 0 THEN
    INSERT INTO public.audit_logs (action, table_name, status, metadata)
    VALUES (
      'PROBATION_AUTO_UPDATE',
      'members',
      'success',
      jsonb_build_object('updated_count', v_updated_count, 'executed_at', NOW())
    );
  END IF;

  RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_update_probation_status()
  TO authenticated, service_role;

-- 1155 is already active, but its manual probation edit left the old
-- 2026-03-18 date behind. Reconcile that stale field without touching wallet
-- or payment history, and preserve the correction in both audit mechanisms.
DO $$
DECLARE
  v_member RECORD;
BEGIN
  SELECT id, status, is_active, probation_end_date
    INTO v_member
  FROM public.members
  WHERE member_number = '1155';

  IF v_member.id IS NOT NULL
     AND v_member.status = 'active'
     AND v_member.probation_end_date IS NOT NULL THEN
    UPDATE public.members
    SET probation_end_date = NULL,
        updated_at = NOW()
    WHERE id = v_member.id;

    INSERT INTO public.member_status_transitions (
      member_id, from_status, to_status, from_is_active, to_is_active,
      reason, details, performed_by_role
    ) VALUES (
      v_member.id, 'probation', 'active', v_member.is_active, TRUE,
      'probation_auto_update_reconciliation',
      jsonb_build_object(
        'source', '20261017000000_fix_trailing_unpaid_obligations_and_probation_reconciliation',
        'previous_probation_end_date', v_member.probation_end_date,
        'note', 'Member was already active; stale date left by prior manual probation update.'
      ),
      'system'
    );

    INSERT INTO public.audit_logs (
      action, table_name, record_id, member_id, status, metadata
    ) VALUES (
      'MEMBER_STATUS_DATA_REPAIR',
      'members',
      v_member.id,
      v_member.id,
      'success',
      jsonb_build_object(
        'source', '20261017000000_fix_trailing_unpaid_obligations_and_probation_reconciliation',
        'previous_status', v_member.status,
        'previous_probation_end_date', v_member.probation_end_date,
        'new_status', v_member.status,
        'new_probation_end_date', NULL
      )
    );
  END IF;
END;
$$;
