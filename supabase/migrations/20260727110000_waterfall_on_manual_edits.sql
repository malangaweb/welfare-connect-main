-- Auto-deductions (penalty-first waterfall) should run on ANY wallet credit,
-- not only on M-Pesa top-ups (wallet_funding). The previous migration added
-- incoming wallet_transfer credits; this one adds manual wallet edits
-- (transaction_type = 'wallet_balance_editor' with a positive amount).
--
-- Suspense allocations are already covered: a matched suspense payment is
-- inserted as either 'wallet_funding' (already triggers the waterfall) or as a
-- direct case payment ('arrears' / 'case_wallet_deduction'), so there is no
-- standalone 'suspense' ledger type that needs separate handling.
--
-- wallet_balance_editor is used for both manual credits (positive) and manual
-- debits (negative). A positive editor means idle money was added to the
-- wallet, so the waterfall must run to apply it to penalty/case obligations.
-- A negative editor has no idle credit to spend, so it is intentionally
-- excluded (the waterfall simply has nothing to pay).

CREATE OR REPLACE FUNCTION public.trigger_wallet_payment_waterfall()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.auto_wallet_reactivation', TRUE) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Run the wallet payment waterfall for incoming wallet credits:
  --   - wallet_funding (direct M-Pesa top-up)
  --   - wallet_transfer with a positive amount (cash received from another member)
  --   - wallet_balance_editor with a positive amount (manual credit added by admin)
  --     — e.g. a suspense allocation or other manual wallet adjustment.
  IF COALESCE(LOWER(NEW.status), 'completed') IN ('completed', 'success')
     AND (
       (NEW.transaction_type = 'wallet_funding')
       OR (NEW.transaction_type = 'wallet_transfer' AND NEW.amount > 0)
       OR (NEW.transaction_type = 'wallet_balance_editor' AND NEW.amount > 0)
     )
     AND (
       TG_OP = 'INSERT'
       OR OLD.transaction_type IS DISTINCT FROM NEW.transaction_type
       OR COALESCE(LOWER(OLD.status), 'completed') NOT IN ('completed', 'success')
     ) THEN
    PERFORM public.apply_wallet_payment_waterfall(NEW.member_id);
  END IF;
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.trigger_wallet_payment_waterfall() TO authenticated, service_role;

COMMENT ON FUNCTION public.trigger_wallet_payment_waterfall() IS
'After a completed wallet credit (wallet_funding, incoming wallet_transfer, or positive wallet_balance_editor / manual edit), runs the auto payment waterfall so the balance is applied to penalties/cases.';
