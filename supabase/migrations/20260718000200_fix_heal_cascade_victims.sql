-- Fix the heal migration (20260718000100):
-- 1) The refund used transaction_type = 'penalty' which calculate_wallet_balance
--    treats as -ABS(amount), making wallet go DOWN instead of UP.
-- 2) The "open cycle" guard over-inflated expected penalty, blocking refunds
--    for members who were genuinely overcharged.
--
-- Correct approach: count each DISTINCT inactivation DAY as one valid cycle
-- (the cascade bug created multiple inactivations on the same day). Refund
-- the excess above (distinct_days * 300) as wallet_funding.

-- Step 1: Delete the wrongly-typed refund row(s) for member 1417.
DELETE FROM public.transactions
WHERE metadata->>'source' = 'cascade_bug_refund'
  AND transaction_type = 'penalty';

-- Step 2: Re-insert proper refunds for all affected members.
DO $$
DECLARE
  m RECORD;
  v_inact_days INT;
  v_penalty_sum NUMERIC;
  v_overpay NUMERIC;
BEGIN
  FOR m IN
    WITH aff AS (
      SELECT t.member_id
      FROM public.transactions t
      WHERE t.transaction_type = 'penalty'
        AND COALESCE(t.metadata->>'source', '') = 'auto_reinstatement_penalty'
        AND t.created_at >= (now() - INTERVAL '30 days')
      GROUP BY t.member_id
      HAVING COUNT(*) > 1
    )
    SELECT a.member_id, mb.member_number, mb.name
    FROM aff a
    JOIN public.members mb ON mb.id = a.member_id
  LOOP
    -- Count distinct days with auto_inactive transitions (1 day = 1 valid cycle)
    SELECT COUNT(DISTINCT created_at::date) INTO v_inact_days
    FROM public.member_status_transitions
    WHERE member_id = m.member_id
      AND reason = 'auto_inactive_two_consecutive_defaults'
      AND created_at >= (now() - INTERVAL '30 days');

    -- Sum of penalty rows tagged auto_reinstatement_penalty
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_penalty_sum
    FROM public.transactions
    WHERE member_id = m.member_id
      AND transaction_type = 'penalty'
      AND COALESCE(metadata->>'source', '') = 'auto_reinstatement_penalty'
      AND COALESCE(LOWER(status), 'completed') IN ('completed', 'success')
      AND created_at >= (now() - INTERVAL '30 days');

    -- Expected: each distinct inactivation day should generate at most 300 in penalty.
    v_overpay := v_penalty_sum - (v_inact_days * 300);

    IF v_overpay < 1 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.transactions (
      member_id, amount, transaction_type, payment_method, status,
      description, reference, metadata
    ) VALUES (
      m.member_id,
      v_overpay,
      'wallet_funding',
      'wallet',
      'completed',
      'Cascade-bug correction: refund of over-charged reinstatement penalty',
      'cascade_bug_refund:' || m.member_id::TEXT || ':' || EXTRACT(EPOCH FROM now())::BIGINT,
      jsonb_build_object(
        'source', 'cascade_bug_refund',
        'affected_member', m.member_number,
        'inactivation_days', v_inact_days,
        'penalty_sum_pre_correction', v_penalty_sum,
        'overpay_amount', v_overpay
      )
    );
  END LOOP;
END;
$$;

-- Refresh wallet balance for all affected members (triggers handle inserts
-- but we also need to account for the delete above).
SELECT refresh_all_member_wallet_balances();

COMMENT ON COLUMN public.transactions.metadata IS 'Holds source markers; cascade_bug_refund rows are post-fix artifacts from healing the cascade bug.';
