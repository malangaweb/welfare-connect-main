-- Treat arrears rows tied to case_id as valid settlement for unpaid obligation checks.
-- This supports late payments on finalized cases through member portal.

CREATE OR REPLACE FUNCTION get_member_unpaid_case_obligations(p_member_id UUID)
RETURNS TABLE(
  case_id UUID,
  case_number TEXT,
  contribution_per_member NUMERIC,
  case_status TEXT,
  case_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.case_number,
    COALESCE(c.contribution_per_member, 0)::NUMERIC,
    CASE
      WHEN c.is_finalized THEN 'closed'
      WHEN c.is_active THEN 'active'
      ELSE 'other'
    END::TEXT,
    COALESCE(c.end_date, c.start_date)
  FROM cases c
  WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
    AND NOT EXISTS (
      SELECT 1
      FROM transactions t
      WHERE t.member_id = p_member_id
        AND t.case_id = c.id
        AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears')
        AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    )
  ORDER BY COALESCE(c.end_date, c.start_date, CURRENT_DATE) DESC, c.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;
