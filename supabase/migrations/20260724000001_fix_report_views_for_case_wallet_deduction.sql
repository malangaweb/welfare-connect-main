-- Fix report views to include case_wallet_deduction transaction type
-- The system migrated from 'contribution' to 'case_wallet_deduction'
-- as the primary case payment type, but the report views still only filter on 'contribution'

-- 1. monthly_contributions_summary: missing case_wallet_deduction and wallet_funding
CREATE OR REPLACE VIEW monthly_contributions_summary AS
SELECT
  DATE_TRUNC('month', t.created_at) as month,
  t.transaction_type,
  COUNT(*) as transaction_count,
  SUM(ABS(t.amount)) as total_amount,
  COUNT(DISTINCT t.member_id) as unique_members
FROM transactions t
WHERE (t.status IS NULL OR t.status = '' OR lower(t.status) IN ('completed', 'success'))
  AND t.transaction_type IN ('contribution', 'case_wallet_deduction', 'wallet_funding', 'registration', 'renewal', 'penalty', 'arrears')
GROUP BY DATE_TRUNC('month', t.created_at), t.transaction_type
ORDER BY month DESC, t.transaction_type;

COMMENT ON VIEW monthly_contributions_summary IS 'Monthly summary of contributions by type (includes case_wallet_deduction)';

-- 2. member_transaction_summary: missing case_wallet_deduction from contribution counts
CREATE OR REPLACE VIEW member_transaction_summary AS
SELECT
  m.id as member_id,
  m.member_number,
  m.name,
  m.phone_number,
  m.status,
  m.wallet_balance,
  COUNT(CASE WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'registration', 'renewal') THEN 1 END) as contributions_count,
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'registration', 'renewal') THEN ABS(t.amount) END), 0) as total_contributions,
  COUNT(CASE WHEN t.transaction_type = 'disbursement' THEN 1 END) as disbursements_count,
  COALESCE(SUM(CASE WHEN t.transaction_type = 'disbursement' THEN ABS(t.amount) END), 0) as total_disbursements,
  MAX(t.created_at) as last_transaction_date
FROM members m
LEFT JOIN transactions t ON t.member_id = m.id
  AND (t.status IS NULL OR t.status = '' OR lower(t.status) IN ('completed', 'success'))
GROUP BY m.id, m.member_number, m.name, m.phone_number, m.status, m.wallet_balance
ORDER BY m.member_number;

COMMENT ON VIEW member_transaction_summary IS 'Summary of member transaction activity (includes case_wallet_deduction)';

-- 3. case_funding_summary: filter transaction types to only include case payments
CREATE OR REPLACE VIEW case_funding_summary AS
SELECT
  c.id as case_id,
  c.case_number,
  c.case_type,
  c.affected_member_id,
  c.contribution_per_member,
  c.start_date,
  c.end_date,
  c.expected_amount,
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(t.amount) ELSE 0 END), 0) as actual_amount,
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction') THEN ABS(t.amount) ELSE 0 END), 0) - c.expected_amount as variance,
  c.is_active,
  c.is_finalized
FROM cases c
LEFT JOIN transactions t ON t.case_id = c.id
  AND (t.status IS NULL OR t.status = '' OR lower(t.status) IN ('completed', 'success'))
  AND t.transaction_type IN ('contribution', 'case_wallet_deduction')
GROUP BY c.id, c.case_number, c.case_type, c.affected_member_id,
         c.contribution_per_member, c.start_date, c.end_date,
         c.expected_amount, c.is_active, c.is_finalized
ORDER BY c.created_at DESC;

COMMENT ON VIEW case_funding_summary IS 'Summary of case funding progress (filtered to case payment types)';

-- 4. get_enhanced_dashboard_summary: missing case_wallet_deduction in total_contributions
CREATE OR REPLACE FUNCTION get_enhanced_dashboard_summary()
RETURNS TABLE (
  total_members BIGINT,
  active_members BIGINT,
  probation_members BIGINT,
  inactive_members BIGINT,
  deceased_members BIGINT,
  total_contributions NUMERIC,
  active_cases BIGINT,
  defaulters_count BIGINT,
  suspense_pending_count BIGINT,
  suspense_pending_amount NUMERIC,
  total_reversals_count BIGINT,
  total_reversals_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM members) as total_members,
    (SELECT COUNT(*) FROM members WHERE is_active = true AND status IN ('active', 'probation')) as active_members,
    (SELECT COUNT(*) FROM members WHERE status = 'probation') as probation_members,
    (SELECT COUNT(*) FROM members WHERE status = 'inactive') as inactive_members,
    (SELECT COUNT(*) FROM members WHERE status = 'deceased') as deceased_members,
    (SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE transaction_type IN ('contribution', 'case_wallet_deduction', 'registration', 'renewal') AND (status IS NULL OR status = '' OR lower(status) IN ('completed', 'success'))) as total_contributions,
    (SELECT COUNT(*) FROM cases WHERE is_active = true) as active_cases,
    (SELECT COUNT(*) FROM active_defaulters) as defaulters_count,
    (SELECT COUNT(*) FROM wrong_mpesa_transactions WHERE status = 'pending') as suspense_pending_count,
    (SELECT COALESCE(SUM(amount), 0) FROM wrong_mpesa_transactions WHERE status = 'pending') as suspense_pending_amount,
    (SELECT COUNT(*) FROM transactions WHERE metadata->>'reversed_transaction_id' IS NOT NULL) as total_reversals_count,
    (SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE metadata->>'reversed_transaction_id' IS NOT NULL) as total_reversals_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_enhanced_dashboard_summary IS 'Enhanced dashboard statistics (includes case_wallet_deduction contributions)';

-- Grant permissions
GRANT SELECT ON monthly_contributions_summary TO anon, authenticated, service_role;
GRANT SELECT ON member_transaction_summary TO anon, authenticated, service_role;
GRANT SELECT ON case_funding_summary TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_enhanced_dashboard_summary() TO anon, authenticated, service_role;

-- 5. active_defaulters: include members with unpaid case obligations
CREATE OR REPLACE VIEW active_defaulters AS
SELECT DISTINCT ON (m.id)
  m.id,
  m.member_number,
  m.name,
  m.phone_number,
  m.email_address,
  m.status,
  CASE
    WHEN m.wallet_balance < 0 THEN m.wallet_balance
    WHEN uo.unpaid_total IS NOT NULL AND uo.unpaid_total > 0 THEN (-(uo.unpaid_total)::numeric)
    ELSE m.wallet_balance
  END as wallet_balance,
  m.registration_date,
  m.probation_end_date,
  m.is_active,
  m.created_at
FROM members m
LEFT JOIN v_member_unpaid_obligations_summary uo ON uo.member_id = m.id
WHERE (
  m.wallet_balance < 0
  OR (uo.unpaid_total IS NOT NULL AND uo.unpaid_total > 0)
)
  AND m.status NOT IN ('deceased')
ORDER BY m.id, wallet_balance ASC;

GRANT SELECT ON active_defaulters TO anon, authenticated, service_role;

-- 6. Drop the AFTER INSERT waterfall trigger on cases.
--    It runs apply_wallet_payment_waterfall synchronously for every obligated
--    member with wallet_balance > 0. With ~146 members at ~1-2s each, the total
--    exceeds the 2-minute statement_timeout.
--    Replaced by the async api-trigger-waterfall edge function called from the
--    frontend after a successful case INSERT.
DROP TRIGGER IF EXISTS zz_trg_waterfall_on_case_insert ON public.cases;

-- 7. Fix discipline logic for case creation.
--    Problems fixed:
--    - The discipline sweep counted ALL unpaid cases (active + finalized), so a
--      member with 1 finalized unpaid case + 1 new active case hit the >= 2
--      threshold and got marked inactive before the waterfall could process them.
--    - The AFTER STATEMENT trigger on transactions fired discipline for EVERY
--      transaction insert, including mid-waterfall case payments.
--    - No audit trail existed for case-creation waterfall execution.
--
-- 7a. apply_wallet_payment_waterfall: set app.auto_wallet_reactivation guard at
--     the very start of the function (not just in Stage 2) so the AFTER STATEMENT
--     discipline trigger sees it and skips its sweep during case payments.
--     Restore the prior guard value on exit.
--
-- 7b. check_and_apply_member_discipline: count only finalized unpaid cases.
--     A member with 1 finalized default + 1 active (still-open) case is NOT yet
--     at the discipline threshold. The streak check (member_default_streaks >= 2)
--     remains as a secondary signal.
--
-- 7c. case_creation_audit table: per-case-creation summary written by the
--     api-trigger-waterfall edge function.
--
-- 7d. DROP zz_trg_check_discipline_after_transaction trigger on transactions.
--     The discipline sweep is now called explicitly from the edge function after
--     all waterfall processing completes, not automatically after every INSERT.

-- 7a: Guard at start of apply_wallet_payment_waterfall
CREATE OR REPLACE FUNCTION public.apply_wallet_payment_waterfall(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_case RECORD;
  v_case_required NUMERIC := 0;
  v_case_paid NUMERIC := 0;
  v_case_remaining NUMERIC := 0;
  v_finalized_paid INT := 0;
  v_active_paid INT := 0;
  v_penalty_required NUMERIC := 300;
  v_penalty_paid NUMERIC := 0;
  v_penalty_remaining NUMERIC := 0;
  v_payment NUMERIC := 0;
  v_wallet NUMERIC := 0;
  v_payout_inserted BOOLEAN := FALSE;
  v_penalty_tx_count INT := 0;
  v_target_member_id UUID;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_probation_end DATE;
  v_inactivated_at TIMESTAMPTZ;
  v_open_cycle BOOLEAN := FALSE;
  v_guard_was_set BOOLEAN := FALSE;
BEGIN
  -- Set the discipline-sweep guard at the start so the AFTER STATEMENT
  -- discipline trigger (if still present anywhere) does not fire mid-waterfall.
  v_guard_was_set := COALESCE(current_setting('app.auto_wallet_reactivation', TRUE), 'false') = 'true';
  PERFORM set_config('app.auto_wallet_reactivation', 'true', true);

  SELECT id, status, is_active
  INTO v_member
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_member.status = 'deceased' THEN
    PERFORM set_config('app.auto_wallet_reactivation', v_guard_was_set::TEXT, true);
    RETURN jsonb_build_object('success', TRUE, 'skipped', 'member_not_payable');
  END IF;

  -- Detect prior open cycle for inactive members.
  IF v_member.status = 'inactive' THEN
    SELECT t.created_at INTO v_inactivated_at
    FROM public.member_status_transitions t
    WHERE t.member_id = p_member_id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND NOT EXISTS (
        SELECT 1 FROM public.member_status_transitions later
        WHERE later.member_id = p_member_id
          AND later.reason = 'auto_wallet_reactivation'
          AND later.created_at > t.created_at
      )
    ORDER BY t.created_at DESC LIMIT 1;

    v_open_cycle := v_inactivated_at IS NOT NULL;
  END IF;

  -- Stage 1: pay oldest unpaid cases (finalized + active), oldest first
  FOR v_case IN
    SELECT c.id, c.case_number, c.is_finalized,
           COALESCE(c.contribution_per_member, 0) AS required_amount,
           COALESCE(c.end_date, c.start_date, c.created_at::DATE) AS case_date
    FROM public.cases c
    WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
      AND public.member_case_obligation_applies(p_member_id, c.id)
    ORDER BY
      CASE WHEN c.is_finalized THEN 0 ELSE 1 END,
      COALESCE(c.end_date, c.start_date, c.created_at::DATE),
      c.created_at, c.id
  LOOP
    SELECT COALESCE(SUM(
      CASE
        WHEN t.transaction_type IN ('contribution', 'case_wallet_deduction', 'arrears') THEN ABS(t.amount)
        WHEN t.transaction_type IN ('contribution_refund', 'case_wallet_refund') THEN -ABS(t.amount)
        ELSE 0
      END
    ), 0)
    INTO v_case_paid
    FROM public.transactions t
    WHERE t.member_id = p_member_id
      AND t.case_id = v_case.id
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success');

    v_case_remaining := GREATEST(v_case.required_amount - v_case_paid, 0);
    IF v_case_remaining <= 0 THEN CONTINUE; END IF;

    v_wallet := public.calculate_wallet_balance(p_member_id);
    IF v_wallet < v_case_remaining THEN EXIT; END IF;

    IF COALESCE(v_case.is_finalized, FALSE) THEN
      INSERT INTO public.transactions (
        member_id, case_id, amount, transaction_type, payment_method, status,
        created_at, description, metadata
      ) VALUES (
        p_member_id, v_case.id, v_case_remaining, 'arrears', 'wallet', 'completed',
        clock_timestamp(),
        'Automatic finalized-case payment for case #' || v_case.case_number,
        jsonb_build_object('source', 'auto_wallet_payment_waterfall', 'priority', 'finalized_case')
      );
      v_finalized_paid := v_finalized_paid + 1;
    ELSE
      INSERT INTO public.transactions (
        member_id, case_id, amount, transaction_type, payment_method, status,
        created_at, description, metadata
      ) VALUES (
        p_member_id, v_case.id, v_case_remaining, 'case_wallet_deduction', 'wallet', 'completed',
        clock_timestamp(),
        'Automatic active-case payment for case #' || v_case.case_number,
        jsonb_build_object('source', 'auto_wallet_payment_waterfall', 'priority', 'active_case')
      );
      v_active_paid := v_active_paid + 1;
    END IF;
  END LOOP;

  -- Stage 2: pay reinstatement penalty (inactive members only, if no case unpaid)
  IF v_member.status = 'inactive' AND v_open_cycle THEN
    SELECT COALESCE(SUM(ABS(t.amount)), 0)
    INTO v_penalty_paid
    FROM public.transactions t
    WHERE t.member_id = p_member_id
      AND t.transaction_type = 'penalty'
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
      AND COALESCE(t.metadata->>'source', '') IN ('auto_reinstatement_penalty', 'api_collect_fee')
      AND t.created_at >= v_inactivated_at;

    v_penalty_remaining := GREATEST(v_penalty_required - v_penalty_paid, 0);
    v_wallet := public.calculate_wallet_balance(p_member_id);

    IF v_penalty_remaining > 0 AND v_wallet > 0 THEN
      PERFORM set_config('app.auto_wallet_reactivation', 'true', true);

      v_payment := LEAST(v_wallet, v_penalty_remaining);
      INSERT INTO public.transactions (
        member_id, amount, transaction_type, payment_method, status,
        created_at, description, reference, metadata
      ) VALUES (
        p_member_id, v_payment, 'penalty', 'wallet', 'completed',
        clock_timestamp(),
        'Automatic reinstatement penalty payment',
        'auto_reinstatement_penalty:' || p_member_id::TEXT || ':' || EXTRACT(EPOCH FROM v_now)::BIGINT,
        jsonb_build_object(
          'source', 'auto_reinstatement_penalty',
          'inactivation_at', v_inactivated_at,
          'required_amount', v_penalty_required,
          'partial_payment', v_payment < v_penalty_remaining
        )
      );
      v_penalty_tx_count := v_penalty_tx_count + 1;
      v_penalty_paid := v_penalty_paid + v_payment;
      v_penalty_remaining := GREATEST(v_penalty_required - v_penalty_paid, 0);
    END IF;

    IF v_penalty_remaining <= 0 THEN
      v_probation_end := (CURRENT_DATE + INTERVAL '90 days')::DATE;
      PERFORM set_config('app.auto_wallet_reactivation', 'true', true);

      UPDATE public.members
      SET status = 'probation', is_active = TRUE, probation_end_date = v_probation_end, updated_at = now()
      WHERE id = p_member_id;

      INSERT INTO public.member_status_transitions (
        member_id, from_status, to_status, from_is_active, to_is_active,
        reason, details, performed_by_role
      ) VALUES (
        p_member_id, 'inactive', 'probation', v_member.is_active, TRUE,
        'auto_wallet_reactivation',
        jsonb_build_object(
          'inactivation_at', v_inactivated_at,
          'penalty_required', v_penalty_required,
          'penalty_paid', v_penalty_paid,
          'probation_end_date', v_probation_end
        ),
        'system'
      );
      v_target_member_id := p_member_id;
    END IF;
  END IF;

  -- Restore the prior guard value so CALLER context is preserved.
  PERFORM set_config('app.auto_wallet_reactivation', v_guard_was_set::TEXT, true);

  RETURN jsonb_build_object(
    'success', TRUE,
    'penalty_payments', v_penalty_tx_count,
    'finalized_cases_paid', v_finalized_paid,
    'active_cases_paid', v_active_paid,
    'flipped_to', CASE WHEN v_target_member_id IS NOT NULL THEN 'probation' ELSE NULL END,
    'wallet_balance', public.calculate_wallet_balance(p_member_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_wallet_payment_waterfall(UUID) TO service_role;

-- 7b: check_and_apply_member_discipline — count only finalized unpaid cases
CREATE OR REPLACE FUNCTION public.check_and_apply_member_discipline()
RETURNS TABLE (member_id UUID, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  v_unpaid_finalized_count INT := 0;
  v_streak INT := 0;
  v_open_cycle BOOLEAN := FALSE;
BEGIN
  FOR m IN
    SELECT mm.id, mm.status
    FROM public.members mm
    WHERE mm.status IN ('probation', 'active')
    ORDER BY mm.member_number
  LOOP
    PERFORM 1 FROM public.members
      WHERE id = m.id AND status = m.status
      FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.member_status_transitions t
      WHERE t.member_id = m.id
        AND t.reason = 'auto_inactive_two_consecutive_defaults'
        AND NOT EXISTS (
          SELECT 1 FROM public.member_status_transitions later
          WHERE later.member_id = m.id AND later.reason = 'auto_wallet_reactivation'
            AND later.created_at > t.created_at
        )
    ) INTO v_open_cycle;

    IF v_open_cycle THEN CONTINUE; END IF;

    SELECT COALESCE((
      SELECT ds.current_streak FROM public.member_default_streaks ds WHERE ds.member_id = m.id
    ), 0) INTO v_streak;

    -- Count ONLY unpaid FINALIZED cases
    SELECT COUNT(*)::INT INTO v_unpaid_finalized_count
    FROM (
      SELECT c.id
      FROM public.cases c
      WHERE c.is_finalized = TRUE
        AND public.member_case_obligation_applies(m.id, c.id)
        AND COALESCE((
          SELECT SUM(CASE
            WHEN t2.transaction_type IN ('contribution','case_wallet_deduction','arrears') THEN ABS(COALESCE(t2.amount,0))
            WHEN t2.transaction_type IN ('contribution_refund','case_wallet_refund') THEN -ABS(COALESCE(t2.amount,0))
            ELSE 0 END
          )::NUMERIC
          FROM public.transactions t2
          WHERE t2.member_id = m.id AND t2.case_id = c.id
            AND t2.transaction_type IN ('contribution','case_wallet_deduction','arrears','contribution_refund','case_wallet_refund')
            AND COALESCE(LOWER(t2.status),'completed') IN ('completed','success')
        ), 0) < COALESCE(c.contribution_per_member,0) - 0.009
    ) ob;

    IF COALESCE(v_streak, 0) < 2 AND COALESCE(v_unpaid_finalized_count, 0) < 2 THEN CONTINUE; END IF;

    UPDATE public.members
    SET status = 'inactive', is_active = FALSE, updated_at = now()
    WHERE id = m.id;

    INSERT INTO public.member_status_transitions (
      member_id, from_status, to_status, from_is_active, to_is_active,
      reason, details, performed_by_role
    ) VALUES (
      m.id, m.status, 'inactive', TRUE, FALSE,
      'auto_inactive_two_consecutive_defaults',
      jsonb_build_object(
        'source', 'discipline_sweep',
        'streak', v_streak,
        'unpaid_finalized_count', v_unpaid_finalized_count
      ),
      'system'
    );

    member_id := m.id;
    action := 'marked_inactive';
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_and_apply_member_discipline() IS
'Sweeps active/probation members with >= 2 unpaid FINALIZED cases OR member_default_streaks >= 2. Marks them inactive.';

GRANT EXECUTE ON FUNCTION public.check_and_apply_member_discipline() TO authenticated, service_role;

-- 7c: case_creation_audit table
CREATE TABLE IF NOT EXISTS public.case_creation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_number TEXT,
  total_members_eligible INTEGER NOT NULL DEFAULT 0,
  members_processed INTEGER NOT NULL DEFAULT 0,
  finalized_cases_paid INTEGER NOT NULL DEFAULT 0,
  active_cases_paid INTEGER NOT NULL DEFAULT 0,
  penalty_payments INTEGER NOT NULL DEFAULT 0,
  reactivations INTEGER NOT NULL DEFAULT 0,
  members_marked_inactive INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.case_creation_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_case_creation_audit_case_id ON public.case_creation_audit(case_id);
CREATE INDEX IF NOT EXISTS idx_case_creation_audit_created_at ON public.case_creation_audit(created_at DESC);

GRANT SELECT ON public.case_creation_audit TO anon, authenticated;
GRANT INSERT ON public.case_creation_audit TO service_role;

-- 7d: Remove the AFTER STATEMENT discipline trigger on transactions.
--     The sweep is now called explicitly from api-trigger-waterfall edge function.
DROP TRIGGER IF EXISTS zz_trg_check_discipline_after_transaction ON public.transactions;
