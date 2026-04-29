-- Harden against legacy double-credit flows that still call update_wallet_balance
-- after inserting a transaction row.
--
-- 1) Normalize legacy transaction_type='mpesa' to canonical 'wallet_funding'.
-- 2) Make update_wallet_balance recompute from ledger instead of incrementing members.wallet_balance directly.
-- 3) Recompute all stored balances from canonical ledger.

-- Backfill legacy transaction type alias.
UPDATE public.transactions t
SET
  transaction_type = 'wallet_funding',
  metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'normalized_transaction_type_from', t.transaction_type,
    'normalized_transaction_type_at', to_jsonb(NOW())
  )
WHERE LOWER(COALESCE(t.transaction_type, '')) = 'mpesa';

CREATE OR REPLACE FUNCTION normalize_transaction_type_aliases()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.transaction_type IS NOT NULL THEN
    NEW.transaction_type := LOWER(BTRIM(NEW.transaction_type));

    IF NEW.transaction_type = 'mpesa' THEN
      NEW.transaction_type := 'wallet_funding';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_transaction_type_aliases ON public.transactions;
CREATE TRIGGER trg_normalize_transaction_type_aliases
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION normalize_transaction_type_aliases();

COMMENT ON FUNCTION normalize_transaction_type_aliases() IS
'Normalizes legacy transaction type aliases (mpesa -> wallet_funding) and lowercases transaction_type.';

-- Compatibility shim: avoid drift from legacy callers by always recomputing from transaction ledger.
CREATE OR REPLACE FUNCTION update_wallet_balance(
  p_member_id UUID,
  p_amount NUMERIC,
  p_action TEXT DEFAULT 'deposit'
)
RETURNS NUMERIC AS $$
DECLARE
  v_new_balance DECIMAL(15,2);
BEGIN
  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'update_wallet_balance called with null member id';
  END IF;

  UPDATE public.members m
  SET wallet_balance = public.calculate_wallet_balance(m.id)
  WHERE m.id = p_member_id
  RETURNING m.wallet_balance INTO v_new_balance;

  RETURN COALESCE(v_new_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_wallet_balance(UUID, numeric, text) IS
'Compatibility shim for legacy callers: recomputes wallet_balance from ledger (calculate_wallet_balance) instead of incremental add/subtract.';

-- Recompute all stored balances to remove any remaining drift.
UPDATE public.members m
SET wallet_balance = public.calculate_wallet_balance(m.id)
WHERE m.id IS NOT NULL;
