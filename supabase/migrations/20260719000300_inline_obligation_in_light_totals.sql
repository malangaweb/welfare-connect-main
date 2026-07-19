-- Rewrite get_members_total_due_light to inline the obligation logic.
--
-- The original implementation called member_case_obligation_applies() per row,
-- which itself runs two SELECTs (member + case). For 500 members x 50 cases
-- that's ~50K SELECTs inside one RPC, taking ~2s.
--
-- The obligation rule is simple: case is active/finalized AND the case's
-- effective start date >= the member's registration date. We can express
-- that as a JOIN condition and let Postgres plan it efficiently.

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
  -- All (member, case) pairs the member is obligated to, with the case's required amount.
  -- Inlines the member_case_obligation_applies logic as join predicates.
  member_cases AS (
    SELECT m.id AS mid,
           c.id AS cid,
           COALESCE(c.contribution_per_member, 0) AS contribution
    FROM public.members m
    JOIN public.cases c
      ON (c.is_active = TRUE OR c.is_finalized = TRUE)
     -- case effective start date >= member registration date
     AND COALESCE(c.start_date, c.created_at::DATE) >= COALESCE(m.registration_date, m.created_at::DATE, CURRENT_DATE)
    WHERE m.id = ANY(v_member_ids)
  ),
  -- Net paid per (member, case) pair across all relevant transaction types.
  member_payments AS (
    SELECT t.member_id AS mid,
           t.case_id AS cid,
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
  -- Total unpaid amount per member (only count cases where remaining > 0.009).
  case_totals AS (
    SELECT mc.mid,
           SUM(GREATEST(mc.contribution - COALESCE(mp.net_paid, 0), 0))::NUMERIC AS case_total
    FROM member_cases mc
    LEFT JOIN member_payments mp ON mp.mid = mc.mid AND mp.cid = mc.cid
    GROUP BY mc.mid
  ),
  -- Reinstatement penalty for inactive members, anchored at the latest
  -- inactivation transition (any reason). 300 hardcoded as in get_member_total_due.
  inactive_members AS (
    SELECT m.id AS mid
    FROM public.members m
    WHERE m.id = ANY(v_member_ids) AND m.status = 'inactive'
  ),
  latest_inactivation AS (
    SELECT DISTINCT ON (im.mid)
           im.mid,
           st.created_at AS inactivated_at
    FROM inactive_members im
    JOIN public.member_status_transitions st
      ON st.member_id = im.mid AND st.to_status = 'inactive'
    ORDER BY im.mid, st.created_at DESC
  ),
  penalty_totals AS (
    SELECT li.mid,
           GREATEST(300 - COALESCE((
             SELECT SUM(ABS(t.amount))::NUMERIC
             FROM public.transactions t
             WHERE t.member_id = li.mid
               AND t.transaction_type = 'penalty'
               AND t.created_at >= COALESCE(li.inactivated_at, '1970-01-01'::TIMESTAMPTZ)
               AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
               AND COALESCE(t.metadata->>'source', '') = 'auto_reinstatement_penalty'
           ), 0), 0) AS penalty_due
    FROM latest_inactivation li
  )
  SELECT u.mid,
         COALESCE(ct.case_total, 0) + COALESCE(pt.penalty_due, 0)
  FROM UNNEST(v_member_ids) u(mid)
  LEFT JOIN case_totals ct ON ct.mid = u.mid
  LEFT JOIN penalty_totals pt ON pt.mid = u.mid;
END;
$$;

COMMENT ON FUNCTION public.get_members_total_due_light(UUID[]) IS
'Lightweight bulk total_due without JSONB. Inlines the member_case_obligation_applies logic to avoid per-row function calls.';

GRANT EXECUTE ON FUNCTION public.get_members_total_due_light(UUID[]) TO service_role, authenticated, anon;
