-- Guard idempotency and over-refund for case refund transactions.
-- Prevents duplicate contribution_refund/case_wallet_refund rows from crediting wallets twice.

CREATE OR REPLACE FUNCTION enforce_case_refund_idempotency()
RETURNS TRIGGER AS $$
DECLARE
  v_effective_type TEXT := COALESCE(NEW.transaction_type, '');
  v_net_paid NUMERIC := 0;
  v_refund_amount NUMERIC := ABS(COALESCE(NEW.amount, 0));
BEGIN
  -- Only guard completed refund rows with member+case keys.
  IF v_effective_type NOT IN ('contribution_refund', 'case_wallet_refund')
     OR COALESCE(NEW.status, 'completed') <> 'completed'
     OR NEW.member_id IS NULL
     OR NEW.case_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize per-member inserts to reduce race windows.
  PERFORM 1 FROM public.members m WHERE m.id = NEW.member_id FOR UPDATE;

  -- Net paid remaining for this member/case before NEW row.
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

  -- No remaining paid amount to refund => duplicate/invalid refund.
  IF v_net_paid <= 0.009 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'No active net case contribution to refund for this member and case';
  END IF;

  -- Reject over-refund (allow tiny rounding tolerance).
  IF v_refund_amount > v_net_paid + 0.009 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = format(
        'Refund amount %.2f exceeds member net paid %.2f for this case',
        v_refund_amount,
        v_net_paid
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_case_refund_idempotency ON public.transactions;
CREATE TRIGGER trg_enforce_case_refund_idempotency
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION enforce_case_refund_idempotency();

COMMENT ON FUNCTION enforce_case_refund_idempotency() IS
'Blocks duplicate/over-refund rows for case refunds by enforcing remaining net paid > 0 and refund <= net paid per member/case.';
