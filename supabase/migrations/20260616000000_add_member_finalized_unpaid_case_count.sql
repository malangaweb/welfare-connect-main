-- Dedicated finalized-case unpaid counter for the members list.
-- Keeps the frontend thin and preserves the broader unpaid-obligation RPC for reports and prechecks.

CREATE OR REPLACE FUNCTION get_member_finalized_unpaid_case_count(p_member_id UUID)
RETURNS INT AS $$
DECLARE
  v_member_status TEXT;
  v_count INT := 0;
BEGIN
  SELECT LOWER(TRIM(m.status)) INTO v_member_status
  FROM public.members m
  WHERE m.id = p_member_id;

  IF v_member_status IS NULL OR v_member_status NOT IN ('active', 'probation') THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::INT
  INTO v_count
  FROM cases c
  WHERE c.is_finalized = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM transactions t
      WHERE t.member_id = p_member_id
        AND t.case_id = c.id
        AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears')
        AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    );

  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_member_finalized_unpaid_case_count(UUID) IS
'Returns the number of finalized cases that remain unpaid for a member.';

GRANT EXECUTE ON FUNCTION public.get_member_finalized_unpaid_case_count(UUID) TO anon, authenticated, service_role;
