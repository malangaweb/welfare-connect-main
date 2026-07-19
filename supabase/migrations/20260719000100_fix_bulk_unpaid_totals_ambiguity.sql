-- Fix ambiguous column reference in get_members_bulk_unpaid_totals.
-- RETURNS TABLE(member_id UUID, ...) creates a PL/pgSQL OUT param named
-- member_id, which clashes with CTE column names. Renamed CTE columns to
-- `mid` throughout and use ALIAS FOR to avoid parameter-name conflicts.

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
DECLARE
  v_member_ids ALIAS FOR p_member_ids;
BEGIN
  RETURN QUERY
  WITH
  member_cases AS (
    SELECT m.id AS mid, c.id AS cid,
           COALESCE(c.contribution_per_member, 0) AS contribution,
           c.case_number,
           CASE WHEN c.is_finalized THEN 'closed' WHEN c.is_active THEN 'active' ELSE 'other' END AS case_status,
           COALESCE(c.end_date, c.start_date, c.created_at::DATE) AS case_date
    FROM public.members m
    JOIN public.cases c ON (c.is_active OR c.is_finalized)
      AND public.member_case_obligation_applies(m.id, c.id)
    WHERE m.id = ANY(v_member_ids)
  ),
  member_payments AS (
    SELECT t.member_id AS mid, t.case_id AS cid,
      SUM(
        CASE
          WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(t.amount)
          WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(t.amount)
          ELSE 0
        END
      )::NUMERIC AS net_paid
    FROM public.transactions t
    WHERE t.member_id = ANY(v_member_ids)
      AND t.case_id IS NOT NULL
      AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears', 'contribution_refund', 'case_wallet_refund')
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    GROUP BY t.member_id, t.case_id
  ),
  outstanding AS (
    SELECT
      mc.mid, mc.cid, mc.contribution, mc.case_number,
      mc.case_status, mc.case_date,
      GREATEST(mc.contribution - COALESCE(mp.net_paid, 0), 0) AS remaining
    FROM member_cases mc
    LEFT JOIN member_payments mp ON mp.mid = mc.mid AND mp.cid = mc.cid
  ),
  member_totals AS (
    SELECT
      o.mid,
      COUNT(*)::BIGINT AS unpaid_case_count,
      SUM(o.remaining)::NUMERIC AS unpaid_case_total,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'case_id', o.cid,
          'case_number', o.case_number,
          'contribution_per_member', o.contribution,
          'case_status', o.case_status,
          'case_date', o.case_date
        )
        ORDER BY o.case_date DESC, o.case_number
      ) FILTER (WHERE o.remaining > 0.009) AS case_details
    FROM outstanding o
    WHERE o.remaining > 0.009
    GROUP BY o.mid
  ),
  inactive_members AS (
    SELECT m.id AS mid
    FROM public.members m
    WHERE m.id = ANY(v_member_ids) AND m.status = 'inactive'
  ),
  member_penalties AS (
    SELECT im.mid,
      COALESCE((
        SELECT SUM(ABS(t.amount))::NUMERIC
        FROM public.transactions t
        WHERE t.member_id = im.mid
          AND t.transaction_type = 'penalty'
          AND t.created_at >= COALESCE(
            (SELECT st.created_at
             FROM public.member_status_transitions st
             WHERE st.member_id = im.mid AND st.to_status = 'inactive'
             ORDER BY st.created_at DESC LIMIT 1),
            '1970-01-01'::TIMESTAMPTZ
          )
          AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
          AND COALESCE(t.metadata->>'source', '') = 'auto_reinstatement_penalty'
      ), 0) AS penalty_paid
    FROM inactive_members im
  )
  SELECT
    u.mid,
    COALESCE(mt.unpaid_case_count, 0),
    COALESCE(mt.unpaid_case_total, 0),
    COALESCE(GREATEST(300 - mp.penalty_paid, 0), 0),
    COALESCE(mt.unpaid_case_total, 0) + COALESCE(GREATEST(300 - mp.penalty_paid, 0), 0),
    COALESCE(mt.case_details, '[]'::JSONB)
  FROM UNNEST(v_member_ids) u(mid)
  LEFT JOIN member_totals mt ON mt.mid = u.mid
  LEFT JOIN member_penalties mp ON mp.mid = u.mid;
END;
$$;
