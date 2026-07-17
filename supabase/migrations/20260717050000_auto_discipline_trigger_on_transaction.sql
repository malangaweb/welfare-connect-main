-- Automatic discipline sweep: fires on every transaction INSERT so probation
-- members with >= 2 unpaid cases are caught without manual intervention.
-- Uses FOR EACH STATEMENT to avoid redundant sweeps on batch inserts.

CREATE OR REPLACE FUNCTION public.trg_check_discipline_after_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.check_and_apply_member_discipline();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_trg_check_discipline_after_transaction ON public.transactions;

CREATE TRIGGER zz_trg_check_discipline_after_transaction
  AFTER INSERT ON public.transactions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_check_discipline_after_transaction();
