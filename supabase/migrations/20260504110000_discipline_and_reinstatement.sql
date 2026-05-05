-- R4/R5/R6: Membership discipline automation, reinstatement workflow, and reporting helpers

-- 1) Audit trail of member status transitions
CREATE TABLE IF NOT EXISTS member_status_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  from_is_active BOOLEAN,
  to_is_active BOOLEAN,
  reason TEXT NOT NULL,
  details JSONB,
  performed_by_user_id TEXT,
  performed_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_status_transitions_member_id
  ON member_status_transitions(member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_status_transitions_reason
  ON member_status_transitions(reason);

COMMENT ON TABLE member_status_transitions IS
'Immutable audit trail for status changes (auto-discipline and reinstatement).';

-- 2) Running consecutive-default counter (R4)
CREATE TABLE IF NOT EXISTS member_default_streaks (
  member_id UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  last_case_id UUID NULL REFERENCES cases(id) ON DELETE SET NULL,
  last_defaulted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_default_streaks_streak
  ON member_default_streaks(current_streak DESC, updated_at DESC);

COMMENT ON TABLE member_default_streaks IS
'Tracks consecutive finalized-case defaults by member.';

-- 3) Helper: unpaid obligations for active/finalized cases (R5)
CREATE OR REPLACE FUNCTION get_member_unpaid_case_obligations(p_member_id UUID)
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
  FROM cases c
  WHERE (c.is_active = TRUE OR c.is_finalized = TRUE)
    AND NOT EXISTS (
      SELECT 1
      FROM transactions t
      WHERE t.member_id = p_member_id
        AND t.case_id = c.id
        AND t.transaction_type IN ('contribution', 'case_wallet_deduction')
        AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
    )
  ORDER BY COALESCE(c.end_date, c.start_date, CURRENT_DATE) DESC, c.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_member_unpaid_case_obligations(UUID) IS
'Returns unpaid active/closed case obligations for one member.';

-- 4) R4 automation: apply default streak and auto-inactivate on second consecutive default
CREATE OR REPLACE FUNCTION apply_member_discipline_on_case_finalize()
RETURNS TRIGGER AS $$
DECLARE
  m RECORD;
  v_prev_streak INT;
  v_last_case_id UUID;
  v_defaulted BOOLEAN;
  v_new_streak INT;
BEGIN
  IF NEW.is_finalized IS TRUE AND COALESCE(OLD.is_finalized, FALSE) IS DISTINCT FROM TRUE THEN
    FOR m IN
      SELECT id, status, is_active
      FROM members
      WHERE status <> 'deceased'
    LOOP
      SELECT s.current_streak, s.last_case_id
      INTO v_prev_streak, v_last_case_id
      FROM member_default_streaks s
      WHERE s.member_id = m.id;

      IF v_last_case_id = NEW.id THEN
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM case_defaulters d
        WHERE d.case_id = NEW.id
          AND d.member_id = m.id
      ) INTO v_defaulted;

      v_new_streak := CASE
        WHEN v_defaulted THEN COALESCE(v_prev_streak, 0) + 1
        ELSE 0
      END;

      INSERT INTO member_default_streaks (member_id, current_streak, last_case_id, last_defaulted, updated_at)
      VALUES (m.id, v_new_streak, NEW.id, v_defaulted, now())
      ON CONFLICT (member_id)
      DO UPDATE SET
        current_streak = EXCLUDED.current_streak,
        last_case_id = EXCLUDED.last_case_id,
        last_defaulted = EXCLUDED.last_defaulted,
        updated_at = now();

      IF v_new_streak >= 2 AND m.status IN ('active', 'probation') THEN
        UPDATE members
        SET status = 'inactive',
            is_active = FALSE,
            updated_at = now()
        WHERE id = m.id;

        INSERT INTO member_status_transitions (
          member_id,
          from_status,
          to_status,
          from_is_active,
          to_is_active,
          reason,
          details,
          performed_by_role
        ) VALUES (
          m.id,
          m.status,
          'inactive',
          m.is_active,
          FALSE,
          'auto_inactive_two_consecutive_defaults',
          jsonb_build_object(
            'case_id', NEW.id,
            'case_number', NEW.case_number,
            'streak', v_new_streak
          ),
          'system'
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS zz_tr_cases_apply_member_discipline ON cases;
CREATE TRIGGER zz_tr_cases_apply_member_discipline
  AFTER UPDATE OF is_finalized ON cases
  FOR EACH ROW
  EXECUTE FUNCTION apply_member_discipline_on_case_finalize();

COMMENT ON FUNCTION apply_member_discipline_on_case_finalize() IS
'When a case is finalized, updates member default streaks and auto-inactivates at streak >= 2.';

-- 5) Reinstatement ledger table (R5)
CREATE TABLE IF NOT EXISTS member_reinstatement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  penalty_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  unpaid_case_count_at_check INT NOT NULL DEFAULT 0,
  unpaid_total_at_check NUMERIC NOT NULL DEFAULT 0,
  probation_end_date DATE NOT NULL,
  performed_by_user_id TEXT,
  performed_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_reinstatement_events_member_id
  ON member_reinstatement_events(member_id, created_at DESC);

-- 6) Reinstatement pre-check (R5)
CREATE OR REPLACE FUNCTION get_member_reinstatement_precheck(p_member_id UUID)
RETURNS TABLE(
  member_id UUID,
  current_status TEXT,
  is_active BOOLEAN,
  wallet_balance NUMERIC,
  penalty_required NUMERIC,
  unpaid_case_count INT,
  unpaid_total NUMERIC,
  blockers JSONB,
  eligible BOOLEAN
) AS $$
DECLARE
  m RECORD;
  v_unpaid_count INT := 0;
  v_unpaid_total NUMERIC := 0;
  v_blockers JSONB := '[]'::jsonb;
BEGIN
  SELECT id, status, is_active, COALESCE(wallet_balance, 0)::NUMERIC AS wallet_balance
  INTO m
  FROM members
  WHERE id = p_member_id;

  IF m.id IS NULL THEN
    RETURN QUERY
    SELECT
      p_member_id,
      'unknown'::TEXT,
      FALSE,
      0::NUMERIC,
      300::NUMERIC,
      0,
      0::NUMERIC,
      jsonb_build_array('member_not_found'),
      FALSE;
    RETURN;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(contribution_per_member), 0)::NUMERIC
  INTO v_unpaid_count, v_unpaid_total
  FROM get_member_unpaid_case_obligations(p_member_id);

  IF m.status <> 'inactive' THEN
    v_blockers := v_blockers || jsonb_build_array('member_must_be_inactive');
  END IF;

  IF v_unpaid_count > 0 THEN
    v_blockers := v_blockers || jsonb_build_array('unpaid_case_obligations');
  END IF;

  IF m.wallet_balance < 300 THEN
    v_blockers := v_blockers || jsonb_build_array('insufficient_wallet_for_penalty');
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.status::TEXT,
    m.is_active,
    m.wallet_balance,
    300::NUMERIC,
    v_unpaid_count,
    v_unpaid_total,
    v_blockers,
    jsonb_array_length(v_blockers) = 0;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_member_reinstatement_precheck(UUID) IS
'Pre-check for reinstatement eligibility using inactivity, unpaid obligations, and wallet penalty coverage.';

-- 7) Reinstatement execution (R5)
CREATE OR REPLACE FUNCTION execute_member_reinstatement(
  p_member_id UUID,
  p_actor_user_id TEXT,
  p_actor_role TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_check RECORD;
  v_penalty_tx_id UUID;
  v_probation_end DATE;
  v_old_status TEXT;
  v_old_is_active BOOLEAN;
BEGIN
  SELECT * INTO v_check
  FROM get_member_reinstatement_precheck(p_member_id)
  LIMIT 1;

  IF COALESCE(v_check.eligible, FALSE) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Reinstatement pre-check failed',
      'blockers', COALESCE(v_check.blockers, '[]'::jsonb),
      'unpaid_case_count', COALESCE(v_check.unpaid_case_count, 0),
      'unpaid_total', COALESCE(v_check.unpaid_total, 0)
    );
  END IF;

  SELECT status, is_active
  INTO v_old_status, v_old_is_active
  FROM members
  WHERE id = p_member_id
  FOR UPDATE;

  INSERT INTO transactions (
    member_id,
    case_id,
    amount,
    transaction_type,
    payment_method,
    status,
    description,
    reference,
    metadata
  ) VALUES (
    p_member_id,
    NULL,
    300,
    'penalty',
    'wallet',
    'completed',
    'Reinstatement penalty',
    'reinstatement_penalty:' || p_member_id::TEXT || ':' || EXTRACT(EPOCH FROM now())::BIGINT,
    jsonb_build_object(
      'source', 'reinstatement_penalty',
      'performed_by_user_id', p_actor_user_id,
      'performed_by_role', p_actor_role
    )
  ) RETURNING id INTO v_penalty_tx_id;

  v_probation_end := (CURRENT_DATE + INTERVAL '3 months')::DATE;

  UPDATE members
  SET status = 'probation',
      is_active = TRUE,
      probation_end_date = v_probation_end,
      updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO member_status_transitions (
    member_id,
    from_status,
    to_status,
    from_is_active,
    to_is_active,
    reason,
    details,
    performed_by_user_id,
    performed_by_role
  ) VALUES (
    p_member_id,
    v_old_status,
    'probation',
    v_old_is_active,
    TRUE,
    'reinstatement_probation',
    jsonb_build_object(
      'penalty_transaction_id', v_penalty_tx_id,
      'probation_end_date', v_probation_end,
      'penalty_amount', 300
    ),
    p_actor_user_id,
    p_actor_role
  );

  INSERT INTO member_reinstatement_events (
    member_id,
    penalty_transaction_id,
    unpaid_case_count_at_check,
    unpaid_total_at_check,
    probation_end_date,
    performed_by_user_id,
    performed_by_role
  ) VALUES (
    p_member_id,
    v_penalty_tx_id,
    v_check.unpaid_case_count,
    v_check.unpaid_total,
    v_probation_end,
    p_actor_user_id,
    p_actor_role
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'member_id', p_member_id,
    'new_status', 'probation',
    'probation_end_date', v_probation_end,
    'penalty_transaction_id', v_penalty_tx_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION execute_member_reinstatement(UUID, TEXT, TEXT) IS
'Atomically applies reinstatement policy: penalty transaction + probation transition with audit records.';

-- 8) R6 reporting helper views
CREATE OR REPLACE VIEW v_member_status_distribution AS
SELECT
  status,
  COUNT(*)::INT AS member_count
FROM members
GROUP BY status;

CREATE OR REPLACE VIEW v_member_discipline_metrics AS
SELECT
  (SELECT COUNT(*)::INT FROM members WHERE status = 'active') AS active_count,
  (SELECT COUNT(*)::INT FROM members WHERE status = 'inactive') AS inactive_count,
  (SELECT COUNT(*)::INT FROM members WHERE status = 'probation') AS probation_count,
  (SELECT COUNT(*)::INT FROM members WHERE status = 'deceased') AS deceased_count,
  (SELECT COUNT(*)::INT FROM member_status_transitions WHERE reason = 'auto_inactive_two_consecutive_defaults') AS auto_inactive_total,
  (SELECT COUNT(*)::INT FROM member_reinstatement_events) AS reinstatement_total,
  (SELECT COALESCE(SUM(amount), 0)::NUMERIC
   FROM transactions
   WHERE transaction_type = 'penalty'
     AND COALESCE(LOWER(status), 'completed') IN ('completed', 'success')
     AND COALESCE(metadata->>'source', '') = 'reinstatement_penalty') AS reinstatement_penalty_total;

COMMENT ON VIEW v_member_discipline_metrics IS
'Aggregated R6 metrics for status discipline and reinstatement accounting.';
