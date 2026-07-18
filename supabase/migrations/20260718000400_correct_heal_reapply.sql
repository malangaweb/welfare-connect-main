-- REVERSE all heal artifacts (20260718000200) and re-apply correct refunds.
--
-- The heal made things worse by inserting wallet_funding refunds, which
-- triggered the waterfall and created NEW penalty + arrears rows.
--
-- Fix:
--   1. Add guard check to the waterfall trigger so it respects
--      app.auto_wallet_reactivation (same guard the discipline trigger uses).
--   2. Delete ALL heal artifacts: cascade_bug_refund rows, plus the
--      waterfall-created penalty + arrears at the same timestamp.
--   3. Reset affected members to inactive (pre-heal status), refresh balance.
--   4. Calculate correct refunds: group penalties into "bursts" (≤2 h apart).
--      Each burst is one cascade event; the legitimate penalty per burst is at
--      most 300. Overpay = Σ MAX(0, burst_sum - 300).
--   5. Apply refund as wallet_funding with the guard set (waterfall suppressed).
--   6. Refresh all wallet balances.

-- ═══ Part 1: add guard to the waterfall trigger ═════════════════════════════

CREATE OR REPLACE FUNCTION public.trigger_wallet_payment_waterfall()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.auto_wallet_reactivation', TRUE) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.transaction_type = 'wallet_funding'
     AND COALESCE(LOWER(NEW.status), 'completed') IN ('completed', 'success')
     AND (
       TG_OP = 'INSERT'
       OR OLD.transaction_type IS DISTINCT FROM 'wallet_funding'
       OR COALESCE(LOWER(OLD.status), 'completed') NOT IN ('completed', 'success')
     ) THEN
    PERFORM public.apply_wallet_payment_waterfall(NEW.member_id);
  END IF;
  RETURN NEW;
END;
$$;

-- ═══ Part 2: delete all heal artifacts + reset members ═══════════════════

DO $$
DECLARE
  v_ts TIMESTAMPTZ;
  v_member_ids UUID[];
BEGIN
  -- Snapshot the heal timestamp and affected members BEFORE any deletes.
  SELECT MIN(created_at) INTO v_ts
  FROM public.transactions
  WHERE metadata->>'source' = 'cascade_bug_refund';

  SELECT ARRAY_AGG(DISTINCT member_id) INTO v_member_ids
  FROM public.transactions
  WHERE metadata->>'source' = 'cascade_bug_refund';

  -- 1. Waterfall-created penalty rows (heal artifacts).
  DELETE FROM public.transactions t
  WHERE t.created_at = v_ts
    AND t.member_id = ANY(v_member_ids)
    AND t.transaction_type = 'penalty'
    AND t.metadata->>'source' = 'auto_reinstatement_penalty';

  -- 2. Waterfall-created arrears rows (heal artifacts).
  DELETE FROM public.transactions t
  WHERE t.created_at = v_ts
    AND t.member_id = ANY(v_member_ids)
    AND t.transaction_type = 'arrears'
    AND t.metadata->>'source' = 'auto_wallet_payment_waterfall';

  -- 3. The refund rows themselves.
  DELETE FROM public.transactions
  WHERE metadata->>'source' = 'cascade_bug_refund';

  -- 4. Reset affected members to pre-heal status.
  UPDATE public.members
  SET status = 'inactive', is_active = FALSE, probation_end_date = NULL
  WHERE id = ANY(v_member_ids);
END;
$$;

SELECT refresh_all_member_wallet_balances();

-- ═══ Part 3: compute correct refunds via burst analysis ═══════════════════

DO $$
DECLARE
  m RECORD;
  v_overpay NUMERIC;
  v_refund_amount NUMERIC;
  v_member_id UUID;
  v_member_num TEXT;
BEGIN
  FOR m IN
    SELECT t.member_id, mb.member_number
    FROM public.transactions t
    JOIN public.members mb ON mb.id = t.member_id
    WHERE t.transaction_type = 'penalty'
      AND COALESCE(t.metadata->>'source', '') = 'auto_reinstatement_penalty'
      AND COALESCE(LOWER(t.status), 'completed') IN ('completed', 'success')
      AND t.created_at >= '2026-07-01'
    GROUP BY t.member_id, mb.member_number
    HAVING COUNT(*) > 1
  LOOP
    -- Burst analysis for this member: group penalties by gaps ≤ 2 hours.
    -- Within each group, overpay = MAX(0, burst_sum - 300).
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
               OVER (ORDER BY created_at)), 9999) > 7200 AS new_burst
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

    -- Apply refund with guard active so the waterfall does NOT re-fire.
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
        'correction_type', 'burst_analysis'
      )
    );
  END LOOP;
END;
$$;

SELECT refresh_all_member_wallet_balances();
