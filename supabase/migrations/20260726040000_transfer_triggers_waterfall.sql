-- Fix: cash transferred INTO a member's wallet by another member
-- (transaction_type = 'wallet_transfer', positive amount) was NOT being
-- picked up by the auto-deduction logic. The AFTER INSERT trigger
-- trigger_wallet_payment_waterfall only fired apply_wallet_payment_waterfall()
-- for 'wallet_funding' rows, so recipient wallet credits from transfers sat
-- idle until some unrelated event (daily sweep / later funding) triggered a
-- deduction. As a result, transferred funds were never applied to the
-- recipient's reinstatement penalty or case obligations automatically.
--
-- Fix: the trigger now also fires the waterfall for completed wallet_transfer
-- credit rows (amount > 0). The waterfall already treats wallet_transfer as a
-- wallet credit via transaction_wallet_effect(), so the balance is available;
-- it simply was never prompted to run on transfers.

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
  --   - wallet_funding (direct top-up)
  --   - wallet_transfer with a positive amount (cash received from another member)
  IF COALESCE(LOWER(NEW.status), 'completed') IN ('completed', 'success')
     AND (
       (NEW.transaction_type = 'wallet_funding')
       OR (NEW.transaction_type = 'wallet_transfer' AND NEW.amount > 0)
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
'After a completed wallet credit (wallet_funding or incoming wallet_transfer), runs the auto payment waterfall so the balance is applied to penalties/cases.';

-- ── Part 2: backfill — run the waterfall for inactive members who have an
-- incoming wallet_transfer credit and an open reactivation cycle, so transfers
-- they already received are now applied to penalty/case obligations.
DO $$
DECLARE
  m RECORD;
  v_res JSONB;
  v_open BOOLEAN;
BEGIN
  FOR m IN
    SELECT DISTINCT mb.id, mb.member_number, mb.name
    FROM public.members mb
    JOIN public.transactions t ON t.member_id = mb.id
    WHERE mb.status = 'inactive'
      AND t.transaction_type = 'wallet_transfer' AND t.amount > 0
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.member_status_transitions t
      WHERE t.member_id = m.id AND t.reason = 'auto_inactive_two_consecutive_defaults'
        AND NOT EXISTS (SELECT 1 FROM public.member_status_transitions l
          WHERE l.member_id = m.id AND l.reason = 'auto_wallet_reactivation'
            AND l.created_at > t.created_at)
    ) INTO v_open;

    IF v_open THEN
      SELECT public.apply_wallet_payment_waterfall(m.id) INTO v_res;
      RAISE NOTICE 'Transfer backfill member #% (%): %', m.member_number, m.name, v_res;
    END IF;
  END LOOP;
END;
$$;
