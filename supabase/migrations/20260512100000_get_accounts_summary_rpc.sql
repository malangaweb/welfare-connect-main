-- Single-query accounts dashboard rollup (replaces fetching thousands of transaction rows in Edge).
CREATE OR REPLACE FUNCTION public.get_accounts_summary()
RETURNS TABLE (
  active_members INT,
  total_members INT,
  total_wallet_balance NUMERIC,
  contributions_total NUMERIC,
  wallet_funding_total NUMERIC,
  refunds_total NUMERIC,
  suspense_pending_count BIGINT,
  suspense_pending_amount NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH m AS (
    SELECT
      COUNT(*)::INT AS total_members,
      COUNT(*) FILTER (WHERE is_active = true)::INT AS active_members,
      COALESCE(SUM(wallet_balance), 0)::NUMERIC AS total_wallet_balance
    FROM members
  ),
  completed AS (
    SELECT *
    FROM transactions t
    WHERE (
      t.status IS NULL
      OR trim(t.status::TEXT) = ''
      OR lower(trim(t.status::TEXT)) IN ('completed', 'success')
    )
  ),
  t AS (
    SELECT
      COALESCE(SUM(ABS(amount)) FILTER (
        WHERE transaction_type IN ('contribution', 'case_wallet_deduction')
      ), 0)::NUMERIC AS contributions_total,
      COALESCE(SUM(ABS(amount)) FILTER (
        WHERE transaction_type = 'wallet_funding'
      ), 0)::NUMERIC AS wallet_funding_total,
      COALESCE(SUM(ABS(amount)) FILTER (
        WHERE transaction_type IN (
          'contribution_refund',
          'case_wallet_refund',
          'refund',
          'wallet_refund'
        )
      ), 0)::NUMERIC AS refunds_total
    FROM completed
  ),
  s AS (
    SELECT
      COUNT(*)::BIGINT AS suspense_pending_count,
      COALESCE(SUM(ABS(amount)), 0)::NUMERIC AS suspense_pending_amount
    FROM wrong_mpesa_transactions
    WHERE status IN ('pending', 'PENDING_REVIEW')
  )
  SELECT
    m.active_members,
    m.total_members,
    m.total_wallet_balance,
    t.contributions_total,
    t.wallet_funding_total,
    t.refunds_total,
    s.suspense_pending_count,
    s.suspense_pending_amount
  FROM m
  CROSS JOIN t
  CROSS JOIN s;
$$;

COMMENT ON FUNCTION public.get_accounts_summary() IS 'Aggregate finance dashboard metrics without scanning large transaction lists in Edge.';

GRANT EXECUTE ON FUNCTION public.get_accounts_summary() TO authenticated, service_role;
