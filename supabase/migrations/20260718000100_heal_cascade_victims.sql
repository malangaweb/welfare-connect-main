-- Heal the cascade trickled members: the previous discipline sweep recursively
-- inserted auto_inactive_two_consecutive_defaults transitions, causing the
-- wallet waterfall's penalty-bucket window to slide and over-charge members
-- with multiple penalty rows in a single wallet_funding cascade.
--
-- For each affected member (2+ auto_reinstatement_penalty rows in the past 30
-- days), reverse the excess over 300 * number of complete auto_wallet_reactivation
-- cycles. Each reversal is an audit-traceable transaction that re-credits the
-- member's wallet.
--
-- Run AFTER 20260718000000_rewrite_waterfall_cases_first_penalty_last.sql.

DO $$
DECLARE
  m RECORD;
  v_cycle_count INT;
  v_penalty_sum NUMERIC;
  v_expected NUMERIC;
  v_overpay NUMERIC;
  v_refund_id UUID;
BEGIN
  FOR m IN
    WITH affected AS (
      SELECT t.member_id
      FROM public.transactions t
      WHERE t.transaction_type = 'penalty'
        AND COALESCE(t.metadata->>'source', '') = 'auto_reinstatement_penalty'
        AND t.created_at >= (now() - INTERVAL '30 days')
      GROUP BY t.member_id
      HAVING COUNT(*) > 1
    )
    SELECT a.member_id, mb.member_number, mb.name
    FROM affected a
    JOIN public.members mb ON mb.id = a.member_id
  LOOP
    -- Number of completed wallet reactivations in the past 30 days for this member.
    SELECT COUNT(*) INTO v_cycle_count
    FROM public.member_status_transitions
    WHERE member_id = m.member_id
      AND reason = 'auto_wallet_reactivation'
      AND created_at >= (now() - INTERVAL '30 days');

    -- Sum of penalty rows tagged auto_reinstatement_penalty.
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_penalty_sum
    FROM public.transactions
    WHERE member_id = m.member_id
      AND transaction_type = 'penalty'
      AND COALESCE(metadata->>'source', '') = 'auto_reinstatement_penalty'
      AND COALESCE(LOWER(status), 'completed') IN ('completed', 'success')
      AND created_at >= (now() - INTERVAL '30 days');

    -- Expected: each completed cycle should have paid 300 penalty. If a member is
    -- still mid-cycle (inactive with no reactivation), they may have partial
    -- penalty payments — count an extra 300 as expected for the open cycle only
    -- if the latest sweep-style inactivation is still pending.
    v_expected := v_cycle_count * 300;

    PERFORM 1
    FROM public.member_status_transitions t
    WHERE t.member_id = m.member_id
      AND t.reason = 'auto_inactive_two_consecutive_defaults'
      AND t.created_at >= (now() - INTERVAL '30 days')
      AND t.created_at > COALESCE((
        SELECT MAX(later.created_at) FROM public.member_status_transitions later
        WHERE later.member_id = m.member_id
          AND later.reason = 'auto_wallet_reactivation'
          AND later.created_at >= (now() - INTERVAL '30 days')
      ), '1970-01-01'::TIMESTAMPTZ)
    LIMIT 1;

    IF FOUND THEN
      v_expected := v_expected + 300;
    END IF;

    v_overpay := v_penalty_sum - v_expected;
    IF v_overpay <= 0.01 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.transactions (
      member_id, amount, transaction_type, payment_method, status,
      description, reference, metadata
    ) VALUES (
      m.member_id,
      v_overpay,
      'penalty',
      'wallet',
      'completed',
      'Cascade-bug correction: refund of over-charged reinstatement penalty',
      'cascade_bug_refund:' || m.member_id::TEXT || ':' || EXTRACT(EPOCH FROM now())::BIGINT,
      jsonb_build_object(
        'source', 'cascade_bug_refund',
        'affected_member', m.member_number,
        'cycle_count', v_cycle_count,
        'penalty_sum_pre_correction', v_penalty_sum,
        'expected_penalty', v_expected,
        'overpay_amount', v_overpay
      )
    )
    RETURNING id INTO v_refund_id;
  END LOOP;
END;
$$;

-- After refunds, wallet balances are maintained by the existing trigger so we
-- don't recompute them here.

COMMENT ON COLUMN public.transactions.metadata IS 'Holds source markers; the cascade_bug_refund rows above are post-fix artifacts from healing the discipline sweep cascade bug.';
