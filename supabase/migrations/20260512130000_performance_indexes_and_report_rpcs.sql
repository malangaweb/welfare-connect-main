-- Time-range scans (reports, exports, dashboards)
CREATE INDEX IF NOT EXISTS idx_transactions_created_at_desc
  ON public.transactions (created_at DESC);

-- Monthly inflow rollup for api-reports-summary (avoids shipping every row in the month to Edge).
CREATE OR REPLACE FUNCTION public.get_monthly_inflow_total(p_start TIMESTAMPTZ)
RETURNS TABLE (total NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(ABS(t.amount)), 0)::NUMERIC AS total
  FROM transactions t
  WHERE t.created_at >= p_start
    AND (
      t.status IS NULL
      OR trim(t.status::TEXT) = ''
      OR lower(trim(t.status::TEXT)) IN ('completed', 'success')
    )
    AND t.transaction_type IN ('wallet_funding', 'contribution', 'case_wallet_deduction');
$$;

COMMENT ON FUNCTION public.get_monthly_inflow_total(TIMESTAMPTZ) IS 'Sum of completed inflow transactions since p_start for reports.';

GRANT EXECUTE ON FUNCTION public.get_monthly_inflow_total(TIMESTAMPTZ) TO authenticated, service_role;

-- Suspense pending rollup for api-reports-summary
CREATE OR REPLACE FUNCTION public.get_suspense_pending_summary()
RETURNS TABLE (pending_count BIGINT, pending_amount NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COUNT(*)::BIGINT AS pending_count,
    COALESCE(SUM(ABS(amount)), 0)::NUMERIC AS pending_amount
  FROM wrong_mpesa_transactions
  WHERE status IN ('pending', 'PENDING_REVIEW');
$$;

COMMENT ON FUNCTION public.get_suspense_pending_summary() IS 'Count and amount of suspense rows awaiting action.';

GRANT EXECUTE ON FUNCTION public.get_suspense_pending_summary() TO authenticated, service_role;
