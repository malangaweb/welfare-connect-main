-- Include open (active) cases in the unpaid case count on the members list.
-- Previously only counted finalized cases; now counts both active and finalized cases
-- where the member has no completed contribution/case_wallet_deduction/arrears transaction.

CREATE OR REPLACE FUNCTION get_member_finalized_unpaid_case_count(p_member_id UUID)
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
BEGIN
  SELECT COUNT(*)::INT
  INTO v_count
  FROM cases c
  WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
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
'Returns the number of open or finalized cases that remain unpaid for a member.';

GRANT EXECUTE ON FUNCTION public.get_member_finalized_unpaid_case_count(UUID) TO anon, authenticated, service_role;
