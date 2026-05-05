-- R6 helper view: unpaid active/closed case obligations by member

CREATE OR REPLACE VIEW v_member_unpaid_obligations_summary AS
WITH unpaid AS (
  SELECT
    m.id AS member_id,
    m.member_number,
    m.name,
    m.status,
    c.id AS case_id,
    c.case_number,
    COALESCE(c.contribution_per_member, 0)::NUMERIC AS contribution_per_member
  FROM members m
  CROSS JOIN cases c
  WHERE c.is_active = TRUE OR c.is_finalized = TRUE
),
paid AS (
  SELECT DISTINCT
    t.member_id,
    t.case_id
  FROM transactions t
  WHERE t.transaction_type IN ('contribution', 'case_wallet_deduction')
    AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
)
SELECT
  u.member_id,
  u.member_number,
  u.name,
  u.status,
  COUNT(*)::INT AS unpaid_case_count,
  COALESCE(SUM(u.contribution_per_member), 0)::NUMERIC AS unpaid_total
FROM unpaid u
LEFT JOIN paid p
  ON p.member_id = u.member_id
 AND p.case_id = u.case_id
WHERE p.member_id IS NULL
GROUP BY u.member_id, u.member_number, u.name, u.status
HAVING COUNT(*) > 0;

COMMENT ON VIEW v_member_unpaid_obligations_summary IS
'Per-member unpaid obligations across active/finalized cases (R6 reconciliation helper).';
