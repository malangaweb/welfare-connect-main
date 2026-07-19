-- Lightweight version: returns only member_id + total_due, skips expensive JSONB.
-- Used by the balance filter to find matching members cheaply, then
-- get_members_bulk_unpaid_totals is called only for the current page.

CREATE OR REPLACE FUNCTION public.get_members_total_due_light(p_member_ids UUID[])
RETURNS TABLE(member_id UUID, total_due NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_ids ALIAS FOR p_member_ids;
BEGIN
  RETURN QUERY
  WITH
  member_cases AS (
    SELECT m.id AS mid, c.id AS cid, COALESCE(c.contribution_per_member, 0) AS contribution
    FROM public.members m
    JOIN public.cases c ON (c.is_active OR c.is_finalized)
      AND public.member_case_obligation_applies(m.id, c.id)
    WHERE m.id = ANY(v_member_ids)
  ),
  member_payments AS (
    SELECT t.member_id AS mid, t.case_id AS cid,
      SUM(CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(t.amount)
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(t.amount)
        ELSE 0
      END)::NUMERIC AS net_paid
    FROM public.transactions t
    WHERE t.member_id = ANY(v_member_ids)
      AND t.case_id IS NOT NULL
      AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears', 'contribution_refund', 'case_wallet_refund')
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    GROUP BY t.member_id, t.case_id
  ),
  case_totals AS (
    SELECT mc.mid,
      SUM(GREATEST(mc.contribution - COALESCE(mp.net_paid, 0), 0))::NUMERIC AS case_total
    FROM member_cases mc
    LEFT JOIN member_payments mp ON mp.mid = mc.mid AND mp.cid = mc.cid
    GROUP BY mc.mid
  ),
  penalty_totals AS (
    SELECT m.id AS mid,
      GREATEST(300 - COALESCE((
        SELECT SUM(ABS(t.amount))::NUMERIC
        FROM public.transactions t
        WHERE t.member_id = m.id
          AND t.transaction_type = 'penalty'
          AND t.created_at >= COALESCE(
            (SELECT st.created_at FROM public.member_status_transitions st
             WHERE st.member_id = m.id AND st.to_status = 'inactive'
             ORDER BY st.created_at DESC LIMIT 1),
            '1970-01-01'::TIMESTAMPTZ
          )
          AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
          AND COALESCE(t.metadata->>'source', '') = 'auto_reinstatement_penalty'
      ), 0), 0) AS penalty_due
    FROM public.members m
    WHERE m.id = ANY(v_member_ids) AND m.status = 'inactive'
  )
  SELECT u.mid, COALESCE(ct.case_total, 0) + COALESCE(pt.penalty_due, 0)
  FROM UNNEST(v_member_ids) u(mid)
  LEFT JOIN case_totals ct ON ct.mid = u.mid
  LEFT JOIN penalty_totals pt ON pt.mid = u.mid;
END;
$$;

COMMENT ON FUNCTION public.get_members_total_due_light(UUID[]) IS
'Lightweight bulk total_due without JSONB. Returns just member_id + total_due.';

GRANT EXECUTE ON FUNCTION public.get_members_total_due_light(UUID[]) TO service_role, authenticated, anon;
