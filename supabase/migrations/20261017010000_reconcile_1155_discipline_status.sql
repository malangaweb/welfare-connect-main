-- Reconcile member 1155 after a historical manual reactivation bypassed the
-- reinstatement workflow and left an open auto-inactive cycle behind.
-- The live rule currently evaluates four consecutive unpaid cases. Restore the
-- status enforced by that rule without changing the wallet or ledger.

DO $$
DECLARE
  v_member RECORD;
  v_streak INT;
BEGIN
  SELECT id, status, is_active, probation_end_date
    INTO v_member
  FROM public.members
  WHERE member_number = '1155';

  IF v_member.id IS NULL THEN
    RETURN;
  END IF;

  v_streak := public.get_max_consecutive_unpaid_cases(v_member.id);

  IF v_member.status IN ('active', 'probation') AND v_streak >= 2 THEN
    UPDATE public.members
    SET status = 'inactive',
        is_active = FALSE,
        probation_end_date = NULL,
        updated_at = NOW()
    WHERE id = v_member.id;

    INSERT INTO public.member_status_transitions (
      member_id, from_status, to_status, from_is_active, to_is_active,
      reason, details, performed_by_role
    ) VALUES (
      v_member.id,
      v_member.status,
      'inactive',
      v_member.is_active,
      FALSE,
      'auto_inactive_two_consecutive_defaults',
      jsonb_build_object(
        'source', 'status_reconciliation',
        'streak', v_streak,
        'previous_probation_end_date', v_member.probation_end_date,
        'note', 'Historical manual reactivation left an open auto-inactive cycle; status reconciled to current unpaid-case rule.'
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
        'source', '20261017010000_reconcile_1155_discipline_status',
        'from_status', v_member.status,
        'to_status', 'inactive',
        'streak', v_streak,
        'wallet_unchanged', TRUE
      )
    );
  END IF;
END;
$$;
