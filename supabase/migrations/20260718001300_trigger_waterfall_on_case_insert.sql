-- Trigger waterfall when new cases are created.
--
-- Root cause: existing trigger only fires on wallet_funding / wallet_funding_manual.
-- If a case is created AFTER the member's last funding, the waterfall never runs
-- and the member's wallet balance sits unused while the case remains unpaid.
--
-- Fix:
--   1. Trigger on cases (INSERT) → run waterfall for every obligated member
--      with wallet_balance > 0.
--   2. Data-fix: find existing members where wallet >= next unpaid case cost
--      and apply the waterfall one-time.

-- ── Part 1: Trigger function ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_waterfall_on_case_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
BEGIN
  FOR v_member IN
    SELECT m.id
    FROM public.members m
    WHERE m.id IS NOT NULL
      AND COALESCE(m.wallet_balance, 0) > 0
      AND public.member_case_obligation_applies(m.id, NEW.id)
  LOOP
    PERFORM public.apply_wallet_payment_waterfall(v_member.id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_trg_waterfall_on_case_insert ON public.cases;
CREATE TRIGGER zz_trg_waterfall_on_case_insert
  AFTER INSERT ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_waterfall_on_case_insert();

COMMENT ON FUNCTION public.trigger_waterfall_on_case_insert() IS
'After a new case is inserted, run the wallet-payment waterfall for every member who is obligated to the case and has a positive wallet balance.';

GRANT EXECUTE ON FUNCTION public.trigger_waterfall_on_case_insert() TO service_role;

-- ── Part 2: Data-fix — apply waterfall for existing stuck members ────────────
--
-- Finds members where wallet_balance >= the cost of their next unpaid case
-- but the waterfall hasn't run since the case was created.
DO $$
DECLARE
  v_member RECORD;
  v_next_case RECORD;
  v_wallet NUMERIC;
  v_count INT := 0;
BEGIN
  FOR v_member IN
    SELECT DISTINCT m.id, m.member_number, m.name, COALESCE(m.wallet_balance, 0) AS wallet
    FROM public.members m
    WHERE m.status IN ('active', 'probation')
      AND COALESCE(m.wallet_balance, 0) > 0
  LOOP
    -- Find the next unpaid obligation for this member (same ordering as waterfall uses)
    SELECT
      c.id,
      COALESCE(c.contribution_per_member, 0) AS required_amount,
      COALESCE(SUM(
        CASE
          WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(t.amount)
          WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(t.amount)
          ELSE 0
        END
      ), 0) AS paid
    INTO v_next_case
    FROM public.cases c
    LEFT JOIN public.transactions t ON t.member_id = v_member.id AND t.case_id = c.id
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    WHERE (c.is_active OR c.is_finalized)
      AND public.member_case_obligation_applies(v_member.id, c.id)
    GROUP BY c.id, c.case_number, c.contribution_per_member, c.is_finalized,
      COALESCE(c.end_date, c.start_date, c.created_at::DATE), c.created_at
    HAVING COALESCE(c.contribution_per_member, 0) > COALESCE(SUM(
      CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(t.amount)
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(t.amount)
        ELSE 0
      END
    ), 0)
    ORDER BY
      CASE WHEN c.is_finalized THEN 0 ELSE 1 END,
      COALESCE(c.end_date, c.start_date, c.created_at::DATE),
      c.created_at,
      c.id
    LIMIT 1;

    IF v_next_case.id IS NOT NULL AND v_member.wallet >= (v_next_case.required_amount - v_next_case.paid) THEN
      PERFORM public.apply_wallet_payment_waterfall(v_member.id);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Waterfall data-fix: applied for % members with sufficient wallet balance', v_count;
END;
$$;
