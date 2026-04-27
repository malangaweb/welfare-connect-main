-- Guardrail: stale member-portal clients may insert `contribution` for pay-to-case.
-- Normalize those rows before insert so wallet is never incorrectly credited.

CREATE OR REPLACE FUNCTION normalize_member_portal_pay_to_case()
RETURNS TRIGGER AS $$
DECLARE
  v_source TEXT;
  v_has_existing_deduction BOOLEAN := FALSE;
BEGIN
  v_source := COALESCE(NEW.metadata->>'source', '');

  IF v_source = 'member_portal_pay_to_case' AND NEW.transaction_type = 'contribution' THEN
    IF NEW.member_id IS NOT NULL AND NEW.case_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM transactions t
        WHERE t.member_id = NEW.member_id
          AND t.case_id = NEW.case_id
          AND t.transaction_type = 'case_wallet_deduction'
          AND COALESCE(t.status, 'completed') = 'completed'
      ) INTO v_has_existing_deduction;
    END IF;

    IF v_has_existing_deduction THEN
      -- Duplicate stale insert: neutralize by marking reversed.
      NEW.status := 'reversed';
      NEW.description := COALESCE(
        NEW.description,
        'REVERSED duplicate member-portal case contribution (already had case_wallet_deduction)'
      );
    ELSE
      -- First stale insert: convert to correct wallet-debit type.
      NEW.transaction_type := 'case_wallet_deduction';
      NEW.description := REPLACE(
        COALESCE(NEW.description, ''),
        'Case contribution',
        'Case wallet deduction'
      );
      IF NEW.description = '' THEN
        NEW.description := 'Case wallet deduction (member portal)';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_member_portal_pay_to_case ON transactions;
CREATE TRIGGER trg_normalize_member_portal_pay_to_case
BEFORE INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION normalize_member_portal_pay_to_case();

COMMENT ON FUNCTION normalize_member_portal_pay_to_case() IS
'Normalizes stale member-portal pay-to-case inserts: contribution -> case_wallet_deduction, or marks duplicate rows reversed.';
