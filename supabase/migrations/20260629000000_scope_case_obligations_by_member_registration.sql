-- New members must not inherit cases that were already closed before they joined.
-- A member owes:
-- - any currently active case, because it is open during their membership; and
-- - any finalized case whose effective close date is on/after their registration date.

CREATE OR REPLACE FUNCTION public.member_case_obligation_applies(
  p_member_id UUID,
  p_case_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_member_start DATE;
  v_case RECORD;
  v_case_effective_end DATE;
BEGIN
  SELECT COALESCE(m.registration_date, m.created_at::DATE, CURRENT_DATE)
  INTO v_member_start
  FROM public.members m
  WHERE m.id = p_member_id;

  IF v_member_start IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT c.is_active, c.is_finalized, c.start_date, c.end_date, c.created_at
  INTO v_case
  FROM public.cases c
  WHERE c.id = p_case_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(v_case.is_active, FALSE) = TRUE THEN
    RETURN TRUE;
  END IF;

  IF COALESCE(v_case.is_finalized, FALSE) = FALSE THEN
    RETURN FALSE;
  END IF;

  v_case_effective_end := COALESCE(
    v_case.end_date,
    v_case.start_date,
    v_case.created_at::DATE
  );

  RETURN COALESCE(v_case_effective_end >= v_member_start, FALSE);
END;
$$;

COMMENT ON FUNCTION public.member_case_obligation_applies(UUID, UUID) IS
'Returns true when a case should count as payable for a member, excluding cases closed before the member registration date.';

GRANT EXECUTE ON FUNCTION public.member_case_obligation_applies(UUID, UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_member_unpaid_case_obligations(p_member_id UUID)
RETURNS TABLE(
  case_id UUID,
  case_number TEXT,
  contribution_per_member NUMERIC,
  case_status TEXT,
  case_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.case_number,
    COALESCE(c.contribution_per_member, 0)::NUMERIC,
    CASE
      WHEN c.is_finalized THEN 'closed'
      WHEN c.is_active THEN 'active'
      ELSE 'other'
    END::TEXT,
    COALESCE(c.end_date, c.start_date)
  FROM public.cases c
  WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
    AND public.member_case_obligation_applies(p_member_id, c.id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.member_id = p_member_id
        AND t.case_id = c.id
        AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears')
        AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    )
  ORDER BY COALESCE(c.end_date, c.start_date, CURRENT_DATE) DESC, c.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.get_member_finalized_unpaid_case_count(p_member_id UUID)
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
BEGIN
  SELECT COUNT(*)::INT
  INTO v_count
  FROM public.cases c
  WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
    AND public.member_case_obligation_applies(p_member_id, c.id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.member_id = p_member_id
        AND t.case_id = c.id
        AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears')
        AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    );

  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_member_finalized_unpaid_case_count(UUID) IS
'Returns the number of open or finalized cases that remain unpaid for a member, excluding cases closed before registration.';

CREATE OR REPLACE VIEW public.v_member_unpaid_obligations_summary AS
WITH unpaid AS (
  SELECT
    m.id AS member_id,
    m.member_number,
    m.name,
    m.status,
    c.id AS case_id,
    c.case_number,
    COALESCE(c.contribution_per_member, 0)::NUMERIC AS contribution_per_member
  FROM public.members m
  CROSS JOIN public.cases c
  WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
    AND public.member_case_obligation_applies(m.id, c.id)
),
paid AS (
  SELECT DISTINCT
    t.member_id,
    t.case_id
  FROM public.transactions t
  WHERE t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears')
    AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
)
SELECT
  u.member_id,
  u.member_number,
  u.name,
  u.status,
  COUNT(*)::INT AS unpaid_case_count,
  COALESCE(SUM(u.contribution_per_member), 0)::NUMERIC AS unpaid_total
FROM unpaid u
LEFT JOIN paid p
  ON p.member_id = u.member_id
 AND p.case_id = u.case_id
WHERE p.member_id IS NULL
GROUP BY u.member_id, u.member_number, u.name, u.status
HAVING COUNT(*) > 0;

COMMENT ON VIEW public.v_member_unpaid_obligations_summary IS
'Per-member unpaid obligations across active/finalized cases, excluding cases closed before member registration.';

ALTER VIEW IF EXISTS public.v_member_unpaid_obligations_summary SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.get_case_payment_compliance_rows()
RETURNS TABLE (
  case_id uuid,
  case_number text,
  case_type text,
  case_status text,
  member_id uuid,
  member_number text,
  member_name text,
  member_status text,
  expected_amount numeric,
  gross_paid numeric,
  total_refunded numeric,
  net_paid numeric,
  outstanding_amount numeric,
  payment_compliance text
)
LANGUAGE sql
STABLE
AS $$
WITH eligible_members AS (
  SELECT
    m.id AS member_id,
    m.member_number,
    m.name,
    m.status AS member_status
  FROM public.members m
  WHERE m.status IN ('active', 'probation')
),
eligible_cases AS (
  SELECT
    c.id AS case_id,
    c.case_number,
    c.case_type,
    COALESCE(c.contribution_per_member, 0)::numeric(15,2) AS expected_amount,
    c.is_active,
    c.is_finalized
  FROM public.cases c
  WHERE c.is_active = true OR c.is_finalized = true
),
net_payments AS (
  SELECT
    t.member_id,
    t.case_id,
    SUM(CASE
      WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(COALESCE(t.amount, 0))
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(COALESCE(t.amount, 0))
      ELSE 0
    END)::numeric(15,2) AS net_paid,
    SUM(CASE
      WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(COALESCE(t.amount, 0))
      ELSE 0
    END)::numeric(15,2) AS gross_paid,
    SUM(CASE
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN ABS(COALESCE(t.amount, 0))
      ELSE 0
    END)::numeric(15,2) AS total_refunded
  FROM public.transactions t
  WHERE COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    AND t.member_id IS NOT NULL
    AND t.case_id IS NOT NULL
    AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears', 'contribution_refund', 'case_wallet_refund')
  GROUP BY t.member_id, t.case_id
)
SELECT
  c.case_id,
  c.case_number::text,
  c.case_type::text,
  CASE
    WHEN c.is_finalized THEN 'finalized'
    WHEN c.is_active THEN 'active'
    ELSE 'closed'
  END::text AS case_status,
  m.member_id,
  m.member_number::text,
  m.name::text AS member_name,
  m.member_status::text,
  c.expected_amount::numeric,
  COALESCE(p.gross_paid, 0)::numeric AS gross_paid,
  COALESCE(p.total_refunded, 0)::numeric AS total_refunded,
  COALESCE(p.net_paid, 0)::numeric AS net_paid,
  GREATEST(c.expected_amount - COALESCE(p.net_paid, 0), 0)::numeric AS outstanding_amount,
  CASE
    WHEN COALESCE(p.net_paid, 0) >= c.expected_amount THEN 'paid'
    WHEN COALESCE(p.net_paid, 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END::text AS payment_compliance
FROM eligible_cases c
CROSS JOIN eligible_members m
LEFT JOIN net_payments p
  ON p.case_id = c.case_id
 AND p.member_id = m.member_id
WHERE public.member_case_obligation_applies(m.member_id, c.case_id)
ORDER BY c.case_number DESC, m.member_number;
$$;

CREATE OR REPLACE FUNCTION public.get_case_payment_compliance_summary()
RETURNS TABLE (
  case_id uuid,
  case_number text,
  case_type text,
  case_status text,
  eligible_members int,
  paid_members int,
  partial_members int,
  unpaid_members int,
  expected_total numeric,
  net_paid_total numeric,
  outstanding_total numeric,
  paid_amount_percent numeric,
  paid_members_percent numeric
)
LANGUAGE sql
STABLE
AS $$
WITH rows AS (
  SELECT * FROM public.get_case_payment_compliance_rows()
)
SELECT
  r.case_id,
  r.case_number,
  r.case_type,
  r.case_status,
  COUNT(*)::int AS eligible_members,
  COUNT(*) FILTER (WHERE r.payment_compliance = 'paid')::int AS paid_members,
  COUNT(*) FILTER (WHERE r.payment_compliance = 'partial')::int AS partial_members,
  COUNT(*) FILTER (WHERE r.payment_compliance = 'unpaid')::int AS unpaid_members,
  SUM(r.expected_amount)::numeric AS expected_total,
  SUM(r.net_paid)::numeric AS net_paid_total,
  SUM(r.outstanding_amount)::numeric AS outstanding_total,
  CASE WHEN SUM(r.expected_amount) > 0
    THEN ROUND((SUM(r.net_paid) / SUM(r.expected_amount)) * 100, 2)
    ELSE 0
  END::numeric AS paid_amount_percent,
  CASE WHEN COUNT(*) > 0
    THEN ROUND((COUNT(*) FILTER (WHERE r.payment_compliance = 'paid')::numeric / COUNT(*)) * 100, 2)
    ELSE 0
  END::numeric AS paid_members_percent
FROM rows r
GROUP BY r.case_id, r.case_number, r.case_type, r.case_status
ORDER BY r.case_number DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_unpaid_case_obligations(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_member_finalized_unpaid_case_count(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_case_payment_compliance_rows() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_case_payment_compliance_summary() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_record_case_payment(
  p_admin_id UUID,
  p_member_id UUID,
  p_case_id UUID,
  p_amount NUMERIC,
  p_transaction_type TEXT DEFAULT 'case_wallet_deduction',
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_case RECORD;
  v_existing_net NUMERIC;
  v_required NUMERIC;
  v_description TEXT;
  v_tx_id UUID;
BEGIN
  SELECT id, case_number, contribution_per_member, is_active, is_finalized
  INTO v_case
  FROM public.cases
  WHERE id = p_case_id
    AND (is_active = TRUE OR is_finalized = TRUE);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Case not found or not payable (must be active or finalized)'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Member not found');
  END IF;

  IF NOT public.member_case_obligation_applies(p_member_id, p_case_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Case #' || v_case.case_number || ' closed before this member was registered'
    );
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Amount must be positive');
  END IF;

  IF p_transaction_type NOT IN ('case_wallet_deduction', 'contribution', 'arrears') THEN
    RETURN jsonb_build_object('success', false, 'message',
      'transaction_type must be case_wallet_deduction, contribution, or arrears'
    );
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears')
        THEN ABS(COALESCE(t.amount, 0))
      WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund')
        THEN -ABS(COALESCE(t.amount, 0))
      ELSE 0
    END
  ), 0) INTO v_existing_net
  FROM public.transactions t
  WHERE t.member_id = p_member_id
    AND t.case_id = p_case_id
    AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success');

  v_required := COALESCE(v_case.contribution_per_member, 0);

  IF v_required > 0 AND v_existing_net >= v_required THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Case #' || v_case.case_number || ' is already fully paid (net: ' || v_existing_net || ', required: ' || v_required || ')'
    );
  END IF;

  v_description := COALESCE(
    p_description,
    'Admin case payment for case #' || v_case.case_number || ' (' || p_transaction_type || ')'
  );

  INSERT INTO public.transactions (
    member_id,
    case_id,
    amount,
    transaction_type,
    status,
    description,
    metadata
  ) VALUES (
    p_member_id,
    p_case_id,
    p_amount,
    p_transaction_type,
    'completed',
    v_description,
    jsonb_build_object(
      'source', 'admin_manual_payment',
      'admin_id', p_admin_id,
      'case_number', v_case.case_number
    )
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, metadata)
  VALUES (
    p_admin_id,
    'INSERT',
    'transactions',
    v_tx_id,
    jsonb_build_object(
      'action', 'admin_record_case_payment',
      'member_id', p_member_id,
      'case_id', p_case_id,
      'case_number', v_case.case_number,
      'amount', p_amount,
      'transaction_type', p_transaction_type,
      'existing_net_paid', v_existing_net,
      'required_amount', v_required,
      'is_finalized', v_case.is_finalized
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment recorded for case #' || v_case.case_number,
    'transaction_id', v_tx_id,
    'amount', p_amount,
    'case_number', v_case.case_number,
    'existing_net_paid', v_existing_net,
    'new_net_paid', v_existing_net + p_amount,
    'required_amount', v_required
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_record_case_payment(UUID, UUID, UUID, NUMERIC, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_member_portal_pay_to_case()
RETURNS TRIGGER AS $$
DECLARE
  v_source TEXT;
  v_has_existing_deduction BOOLEAN := FALSE;
BEGIN
  v_source := COALESCE(NEW.metadata->>'source', '');

  IF v_source = 'member_portal_pay_to_case' AND NEW.member_id IS NOT NULL AND NEW.case_id IS NOT NULL THEN
    IF NOT public.member_case_obligation_applies(NEW.member_id, NEW.case_id) THEN
      RAISE EXCEPTION 'Case is not payable by this member because it closed before member registration';
    END IF;
  END IF;

  IF v_source = 'member_portal_pay_to_case' AND NEW.transaction_type = 'contribution' THEN
    IF NEW.member_id IS NOT NULL AND NEW.case_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.transactions t
        WHERE t.member_id = NEW.member_id
          AND t.case_id = NEW.case_id
          AND t.transaction_type = 'case_wallet_deduction'
          AND COALESCE(t.status, 'completed') = 'completed'
      ) INTO v_has_existing_deduction;
    END IF;

    IF v_has_existing_deduction THEN
      NEW.status := 'reversed';
      NEW.description := COALESCE(
        NEW.description,
        'REVERSED duplicate member-portal case contribution (already had case_wallet_deduction)'
      );
    ELSE
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

DROP TRIGGER IF EXISTS trg_normalize_member_portal_pay_to_case ON public.transactions;
CREATE TRIGGER trg_normalize_member_portal_pay_to_case
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.normalize_member_portal_pay_to_case();

COMMENT ON FUNCTION public.normalize_member_portal_pay_to_case() IS
'Normalizes stale member-portal pay-to-case inserts and blocks cases closed before member registration.';
