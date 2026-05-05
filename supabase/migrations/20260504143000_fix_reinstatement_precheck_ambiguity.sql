-- Fix ambiguous is_active reference in get_member_reinstatement_precheck

CREATE OR REPLACE FUNCTION get_member_reinstatement_precheck(p_member_id UUID)
RETURNS TABLE(
  member_id UUID,
  current_status TEXT,
  is_active BOOLEAN,
  wallet_balance NUMERIC,
  penalty_required NUMERIC,
  unpaid_case_count INT,
  unpaid_total NUMERIC,
  blockers JSONB,
  eligible BOOLEAN
) AS $$
DECLARE
  m RECORD;
  v_unpaid_count INT := 0;
  v_unpaid_total NUMERIC := 0;
  v_blockers JSONB := '[]'::jsonb;
BEGIN
  SELECT mm.id, mm.status, mm.is_active, COALESCE(mm.wallet_balance, 0)::NUMERIC AS wallet_balance
  INTO m
  FROM members mm
  WHERE mm.id = p_member_id;

  IF m.id IS NULL THEN
    RETURN QUERY
    SELECT
      p_member_id,
      'unknown'::TEXT,
      FALSE,
      0::NUMERIC,
      300::NUMERIC,
      0,
      0::NUMERIC,
      jsonb_build_array('member_not_found'),
      FALSE;
    RETURN;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(contribution_per_member), 0)::NUMERIC
  INTO v_unpaid_count, v_unpaid_total
  FROM get_member_unpaid_case_obligations(p_member_id);

  IF m.status <> 'inactive' THEN
    v_blockers := v_blockers || jsonb_build_array('member_must_be_inactive');
  END IF;

  IF v_unpaid_count > 0 THEN
    v_blockers := v_blockers || jsonb_build_array('unpaid_case_obligations');
  END IF;

  IF m.wallet_balance < 300 THEN
    v_blockers := v_blockers || jsonb_build_array('insufficient_wallet_for_penalty');
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.status::TEXT,
    m.is_active,
    m.wallet_balance,
    300::NUMERIC,
    v_unpaid_count,
    v_unpaid_total,
    v_blockers,
    jsonb_array_length(v_blockers) = 0;
END;
$$ LANGUAGE plpgsql STABLE;
