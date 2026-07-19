-- Bulk variant of get_member_total_due that processes all members in one SQL pass.
-- Eliminates the N+1 problem when loading the member list with a balance filter.

CREATE OR REPLACE FUNCTION public.get_members_bulk_unpaid_totals(p_member_ids UUID[])
RETURNS TABLE(
  member_id UUID,
  unpaid_case_count BIGINT,
  unpaid_case_total NUMERIC,
  reinstatement_penalty_due NUMERIC,
  total_due NUMERIC,
  case_details JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  member_cases AS (
    SELECT m.id AS member_id, c.id AS case_id,
           COALESCE(c.contribution_per_member, 0) AS contribution,
           c.case_number,
           CASE WHEN c.is_finalized THEN 'closed' WHEN c.is_active THEN 'active' ELSE 'other' END AS case_status,
           COALESCE(c.end_date, c.start_date, c.created_at::DATE) AS case_date
    FROM public.members m
    JOIN public.cases c ON (c.is_active OR c.is_finalized)
      AND public.member_case_obligation_applies(m.id, c.id)
    WHERE m.id = ANY(p_member_ids)
  ),
  member_payments AS (
    SELECT t.member_id, t.case_id,
      SUM(
        CASE
          WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(t.amount)
          WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(t.amount)
          ELSE 0
        END
      )::NUMERIC AS net_paid
    FROM public.transactions t
    WHERE t.member_id = ANY(p_member_ids)
      AND t.case_id IS NOT NULL
      AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears', 'contribution_refund', 'case_wallet_refund')
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    GROUP BY t.member_id, t.case_id
  ),
  outstanding AS (
    SELECT
      mc.member_id, mc.case_id, mc.contribution, mc.case_number,
      mc.case_status, mc.case_date,
      GREATEST(mc.contribution - COALESCE(mp.net_paid, 0), 0) AS remaining
    FROM member_cases mc
    LEFT JOIN member_payments mp ON mp.member_id = mc.member_id AND mp.case_id = mc.case_id
  ),
  member_totals AS (
    SELECT
      member_id,
      COUNT(*)::BIGINT AS unpaid_case_count,
      SUM(remaining)::NUMERIC AS unpaid_case_total,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'case_id', case_id,
          'case_number', case_number,
          'contribution_per_member', contribution,
          'case_status', case_status,
          'case_date', case_date
        )
        ORDER BY case_date DESC, case_number
      ) FILTER (WHERE remaining > 0.009) AS case_details
    FROM outstanding
    WHERE remaining > 0.009
    GROUP BY member_id
  ),
  inactive_members AS (
    SELECT m.id AS member_id
    FROM public.members m
    WHERE m.id = ANY(p_member_ids) AND m.status = 'inactive'
  ),
  member_penalties AS (
    SELECT im.member_id,
      COALESCE((
        SELECT SUM(ABS(t.amount))::NUMERIC
        FROM public.transactions t
        WHERE t.member_id = im.member_id
          AND t.transaction_type = 'penalty'
          AND t.created_at >= COALESCE(
            (SELECT st.created_at
             FROM public.member_status_transitions st
             WHERE st.member_id = im.member_id AND st.to_status = 'inactive'
             ORDER BY st.created_at DESC LIMIT 1),
            '1970-01-01'::TIMESTAMPTZ
          )
          AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
          AND COALESCE(t.metadata->>'source', '') = 'auto_reinstatement_penalty'
      ), 0) AS penalty_paid
    FROM inactive_members im
  )
  SELECT
    m.id,
    COALESCE(mt.unpaid_case_count, 0),
    COALESCE(mt.unpaid_case_total, 0),
    COALESCE(GREATEST(300 - mp.penalty_paid, 0), 0),
    COALESCE(mt.unpaid_case_total, 0) + COALESCE(GREATEST(300 - mp.penalty_paid, 0), 0),
    COALESCE(mt.case_details, '[]'::JSONB)
  FROM UNNEST(p_member_ids) m(id)
  LEFT JOIN member_totals mt ON mt.member_id = m.id
  LEFT JOIN member_penalties mp ON mp.member_id = m.id;
END;
$$;

COMMENT ON FUNCTION public.get_members_bulk_unpaid_totals(UUID[]) IS
'Bulk version of get_member_total_due for an array of member IDs. Returns unpaid case counts, totals, penalty amounts, and case details in a single query pass.';

GRANT EXECUTE ON FUNCTION public.get_members_bulk_unpaid_totals(UUID[]) TO service_role;
