-- Supplemental refunds for members missed by the 2-hour burst threshold
-- in 20260718000400.  Their cascade-bug penalties were 2-19 h apart (same
-- cascade event spanning multiple sweep cycles).  A 24-hour threshold
-- correctly groups them.
--
-- Only members who have NOT yet received a cascade_bug_refund are targeted.

DO $$
DECLARE
  m RECORD;
  v_overpay NUMERIC;
BEGIN
  FOR m IN
    -- Members with 2+ penalties in a 24-hour window, no refund yet.
    WITH candidates AS (
      SELECT t.member_id, mb.member_number
      FROM public.transactions t
      JOIN public.members mb ON mb.id = t.member_id
      WHERE t.transaction_type = 'penalty'
        AND COALESCE(t.metadata->>'source', '') = 'auto_reinstatement_penalty'
        AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
        AND t.created_at >= '2026-07-01'
      GROUP BY t.member_id, mb.member_number
      HAVING COUNT(*) > 1
    )
    SELECT c.member_id, c.member_number
    FROM candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.member_id = c.member_id AND t.metadata->>'source' = 'cascade_bug_refund'
    )
  LOOP
    -- 24-hour burst analysis: all penalties within 24h of each other
    -- belong to the same cascade event.
    WITH ordered AS (
      SELECT t.amount, t.created_at
      FROM public.transactions t
      WHERE t.member_id = m.member_id
        AND t.transaction_type = 'penalty'
        AND COALESCE(t.metadata->>'source', '') = 'auto_reinstatement_penalty'
        AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
        AND t.created_at >= '2026-07-01'
      ORDER BY t.created_at
    ),
    with_gap AS (
      SELECT amount, created_at,
             COALESCE(EXTRACT(EPOCH FROM created_at - LAG(created_at)
               OVER (ORDER BY created_at)), 99999) > 86400 AS new_burst
      FROM ordered
    ),
    grouped AS (
      SELECT amount,
             SUM(CASE WHEN new_burst THEN 1 ELSE 0 END)
               OVER (ORDER BY created_at ROWS UNBOUNDED PRECEDING) AS grp
      FROM with_gap
    ),
    burst_sums AS (
      SELECT grp, SUM(ABS(amount)) AS burst_sum
      FROM grouped
      GROUP BY grp
    )
    SELECT COALESCE(SUM(GREATEST(burst_sum - 300, 0)), 0) INTO v_overpay
    FROM burst_sums;

    IF v_overpay < 1 THEN
      CONTINUE;
    END IF;

    PERFORM set_config('app.auto_wallet_reactivation', 'true', true);
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
        'overpay_amount', v_overpay,
        'correction_type', 'burst_analysis_24h'
      )
    );
  END LOOP;
END;
$$;

SELECT refresh_all_member_wallet_balances();
