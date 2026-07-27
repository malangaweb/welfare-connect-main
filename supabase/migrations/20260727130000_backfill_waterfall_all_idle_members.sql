-- Durable backfill: run the auto-deduction waterfall for EVERY non-deceased
-- member who currently has an idle wallet balance, regardless of status.
--
-- Why this is needed: the earlier backfills (20260726040000 transfer,
-- 20260727110000 manual edits) only processed INACTIVE members. Active or
-- probation members whose wallet credit (transfer / manual edit / funding)
-- arrived while an older trigger version was live could be stranded with an
-- unpaid case even though their balance fully covered it. This migration
-- closes that gap for all statuses.
--
-- Idempotent by construction: apply_wallet_payment_waterfall only inserts a
-- deduction when a case is FULLY coverable by the wallet (no partial case
-- payments), and its internal NOT EXISTS guards prevent re-paying a case that
-- is already paid. Re-running is therefore safe.

CREATE OR REPLACE FUNCTION public.backfill_wallet_waterfall_for_idle_members()
RETURNS TABLE (
  out_member_number TEXT,
  out_status TEXT,
  out_wallet_balance NUMERIC,
  out_cases_paid INT,
  out_penalty_payments INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  v_res JSONB;
  v_wallet NUMERIC;
BEGIN
  FOR m IN
    SELECT id, member_number, status
    FROM public.members
    WHERE status <> 'deceased'
      AND public.calculate_wallet_balance(id) > 0
    ORDER BY member_number
  LOOP
    v_wallet := public.calculate_wallet_balance(m.id);
    SELECT public.apply_wallet_payment_waterfall(m.id) INTO v_res;

    out_member_number := m.member_number;
    out_status := m.status;
    out_wallet_balance := v_wallet;
    out_cases_paid := COALESCE((v_res->>'finalized_cases_paid')::INT, 0)
                   + COALESCE((v_res->>'active_cases_paid')::INT, 0);
    out_penalty_payments := COALESCE((v_res->>'penalty_payments')::INT, 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_wallet_waterfall_for_idle_members() TO service_role;

-- Run it now (one-off). Re-run any time via:
--   SELECT * FROM public.backfill_wallet_waterfall_for_idle_members();
SELECT * FROM public.backfill_wallet_waterfall_for_idle_members();

-- Keep the helper for future re-runs / manual sweeps.
COMMENT ON FUNCTION public.backfill_wallet_waterfall_for_idle_members() IS
'Applies the auto-deduction waterfall to every non-deceased member with an idle wallet balance (all statuses). Idempotent — safe to re-run.';
