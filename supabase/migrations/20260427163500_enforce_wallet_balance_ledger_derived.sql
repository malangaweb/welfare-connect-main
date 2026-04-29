-- Enforce members.wallet_balance as a ledger-derived value.
-- Prevents direct wallet_balance writes from drifting away from calculate_wallet_balance(id).

CREATE OR REPLACE FUNCTION enforce_member_wallet_balance_from_ledger()
RETURNS TRIGGER AS $$
BEGIN
  -- Keep INSERT behavior predictable; default to provided value or 0 when no ledger exists yet.
  IF TG_OP = 'INSERT' THEN
    NEW.wallet_balance := COALESCE(NEW.wallet_balance, 0);
    RETURN NEW;
  END IF;

  -- On UPDATE, always derive from ledger.
  NEW.wallet_balance := public.calculate_wallet_balance(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_member_wallet_balance_from_ledger ON public.members;
CREATE TRIGGER trg_enforce_member_wallet_balance_from_ledger
BEFORE UPDATE OF wallet_balance ON public.members
FOR EACH ROW
EXECUTE FUNCTION enforce_member_wallet_balance_from_ledger();

COMMENT ON FUNCTION enforce_member_wallet_balance_from_ledger() IS
'Ensures members.wallet_balance on UPDATE is always derived from calculate_wallet_balance(id).';
