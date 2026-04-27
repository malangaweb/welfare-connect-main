-- Replace row-level unique idempotency with net-paid idempotency.
-- Reason: unique(member_id, case_id) blocks legitimate re-pay after refunds.

-- 1) Remove unique-index based idempotency (including legacy variants).
ALTER TABLE IF EXISTS public.transactions
  DROP CONSTRAINT IF EXISTS transactions_member_id_case_id_key;

DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN
    SELECT schemaname, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'transactions'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%ON public.transactions% (member_id, case_id)%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', idx.schemaname, idx.indexname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS idx_transactions_case_wallet_deduction_idempotent;

-- Keep a non-unique index for lookups.
CREATE INDEX IF NOT EXISTS idx_transactions_case_wallet_deduction_member_case
ON public.transactions (member_id, case_id)
WHERE transaction_type = 'case_wallet_deduction';

-- 2) Trigger guard: block only when member/case currently has net positive paid amount.
CREATE OR REPLACE FUNCTION enforce_case_wallet_deduction_net_idempotency()
RETURNS TRIGGER AS $$
DECLARE
  v_source TEXT := COALESCE(NEW.metadata->>'source', '');
  v_effective_type TEXT := NEW.transaction_type;
  v_net_paid NUMERIC := 0;
BEGIN
  -- Normalize stale member-portal inserts conceptually for this check.
  IF v_source = 'member_portal_pay_to_case' AND v_effective_type = 'contribution' THEN
    v_effective_type := 'case_wallet_deduction';
  END IF;

  -- Guard only completed case wallet deductions with member+case keys.
  IF v_effective_type <> 'case_wallet_deduction'
     OR COALESCE(NEW.status, 'completed') <> 'completed'
     OR NEW.member_id IS NULL
     OR NEW.case_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize per-member attempts to reduce double-insert races.
  PERFORM 1 FROM public.members m WHERE m.id = NEW.member_id FOR UPDATE;

  SELECT COALESCE(SUM(
    CASE
      WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(t.amount)
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(t.amount)
      ELSE 0
    END
  ), 0)
  INTO v_net_paid
  FROM public.transactions t
  WHERE t.member_id = NEW.member_id
    AND t.case_id = NEW.case_id
    AND COALESCE(t.status, 'completed') = 'completed'
    AND t.transaction_type IN (
      'contribution',
      'case_wallet_deduction',
      'contribution_refund',
      'case_wallet_refund'
    );

  IF v_net_paid > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Active case payment already exists for this member and case';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_case_wallet_deduction_net_idempotency ON public.transactions;
CREATE TRIGGER trg_enforce_case_wallet_deduction_net_idempotency
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION enforce_case_wallet_deduction_net_idempotency();

COMMENT ON FUNCTION enforce_case_wallet_deduction_net_idempotency() IS
'Prevents duplicate active case pay-ins by checking net paid amount per member/case (deductions - refunds), allowing re-pay after full refund.';
