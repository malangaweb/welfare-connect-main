-- Fix: auto case-wallet-deduction not running on case creation "in some places".
--
-- Background
-- ----------
-- Migration 20260724000001 dropped the AFTER INSERT waterfall trigger on
-- public.cases because it ran apply_wallet_payment_waterfall() synchronously for
-- every obligated member INSIDE the INSERT statement, blowing the 2-minute
-- statement_timeout at ~146 members. It was replaced by a fire-and-forget call
-- to the api-trigger-waterfall edge function from NewCase.tsx.
--
-- That made auto-deduction on case creation depend entirely on the browser
-- successfully invoking an edge function. It silently does NOT run when:
--   * the edge-function call fails (expired token, network, timeout) — the
--     frontend swallows the error (.catch(console.error)); no retry.
--   * a case is created/activated by any path other than NewCase.tsx
--     (case edit that flips is_active, bulk import, direct SQL).
--
-- Fix strategy: restore a DB-level GUARANTEE without the timeout problem.
--   1. case_waterfall_queue: durable work queue.
--   2. AFTER INSERT trigger on cases enqueues a row (O(1) — no per-member work,
--      cannot time out).
--   3. process_pending_case_waterfalls(): drains the queue, running the
--      idempotent waterfall per obligated member + the discipline sweep. Called
--      by the edge function AND safe to run from pg_cron as a safety net.
--
-- The per-member waterfall is idempotent, so re-processing is always safe.

-- ── Part 1: durable queue ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.case_waterfall_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | processing | done | error
  attempts     INT  NOT NULL DEFAULT 0,
  last_error   TEXT,
  enqueued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (case_id)
);

CREATE INDEX IF NOT EXISTS idx_case_waterfall_queue_status
  ON public.case_waterfall_queue (status, enqueued_at);

ALTER TABLE public.case_waterfall_queue ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.case_waterfall_queue TO authenticated, anon;
GRANT INSERT, UPDATE ON public.case_waterfall_queue TO service_role;

-- ── Part 2: O(1) enqueue trigger on case insert ────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_case_waterfall()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enqueue payable cases (active or finalized). Instant, no member work.
  IF COALESCE(NEW.is_active, FALSE) OR COALESCE(NEW.is_finalized, FALSE) THEN
    INSERT INTO public.case_waterfall_queue (case_id, status)
    VALUES (NEW.id, 'pending')
    ON CONFLICT (case_id) DO UPDATE
      SET status = 'pending',
          attempts = 0,
          last_error = NULL,
          enqueued_at = now(),
          processed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_trg_enqueue_case_waterfall ON public.cases;
CREATE TRIGGER zz_trg_enqueue_case_waterfall
  AFTER INSERT ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_case_waterfall();

-- Also enqueue when an existing case is (re)activated or finalized, since those
-- transitions create new obligations too.
CREATE OR REPLACE FUNCTION public.enqueue_case_waterfall_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (COALESCE(NEW.is_active, FALSE) AND NOT COALESCE(OLD.is_active, FALSE))
     OR (COALESCE(NEW.is_finalized, FALSE) AND NOT COALESCE(OLD.is_finalized, FALSE)) THEN
    INSERT INTO public.case_waterfall_queue (case_id, status)
    VALUES (NEW.id, 'pending')
    ON CONFLICT (case_id) DO UPDATE
      SET status = 'pending',
          attempts = 0,
          last_error = NULL,
          enqueued_at = now(),
          processed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_trg_enqueue_case_waterfall_upd ON public.cases;
CREATE TRIGGER zz_trg_enqueue_case_waterfall_upd
  AFTER UPDATE OF is_active, is_finalized ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_case_waterfall_on_update();

-- ── Part 3: process a single queued case (idempotent) ──────────────────────
CREATE OR REPLACE FUNCTION public.process_case_waterfall(p_case_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_result JSONB;
  v_eligible INT := 0;
  v_processed INT := 0;
  v_finalized_paid INT := 0;
  v_active_paid INT := 0;
  v_penalty_payments INT := 0;
  v_reactivations INT := 0;
  v_errors JSONB := '[]'::JSONB;
BEGIN
  -- Iterate only members with a positive wallet who are obligated to this case.
  FOR v_member IN
    SELECT m.id
    FROM public.members m
    WHERE COALESCE(m.wallet_balance, 0) > 0
      AND public.member_case_obligation_applies(m.id, p_case_id)
  LOOP
    v_eligible := v_eligible + 1;
    BEGIN
      v_result := public.apply_wallet_payment_waterfall(v_member.id);
      v_processed := v_processed + 1;
      IF COALESCE(v_result->>'skipped', '') = '' THEN
        v_finalized_paid   := v_finalized_paid   + COALESCE((v_result->>'finalized_cases_paid')::INT, 0);
        v_active_paid      := v_active_paid      + COALESCE((v_result->>'active_cases_paid')::INT, 0);
        v_penalty_payments := v_penalty_payments + COALESCE((v_result->>'penalty_payments')::INT, 0);
        IF v_result->>'flipped_to' = 'probation' THEN
          v_reactivations := v_reactivations + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('member_id', v_member.id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'case_id', p_case_id,
    'total_members_eligible', v_eligible,
    'members_processed', v_processed,
    'finalized_cases_paid', v_finalized_paid,
    'active_cases_paid', v_active_paid,
    'penalty_payments', v_penalty_payments,
    'reactivations', v_reactivations,
    'errors', v_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_case_waterfall(UUID) TO service_role;

-- ── Part 4: drain the pending queue (safety net for missed cases) ──────────
CREATE OR REPLACE FUNCTION public.process_pending_case_waterfalls(p_limit INT DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q RECORD;
  v_res JSONB;
  v_cases_processed INT := 0;
  v_errors JSONB := '[]'::JSONB;
BEGIN
  FOR q IN
    SELECT id, case_id
    FROM public.case_waterfall_queue
    WHERE status IN ('pending', 'error')
      AND attempts < 5
    ORDER BY enqueued_at
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.case_waterfall_queue
      SET status = 'processing', attempts = attempts + 1
      WHERE id = q.id;

    BEGIN
      v_res := public.process_case_waterfall(q.case_id);
      UPDATE public.case_waterfall_queue
        SET status = 'done', processed_at = now(), last_error = NULL
        WHERE id = q.id;
      v_cases_processed := v_cases_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.case_waterfall_queue
        SET status = 'error', last_error = SQLERRM
        WHERE id = q.id;
      v_errors := v_errors || jsonb_build_object('case_id', q.case_id, 'error', SQLERRM);
    END;
  END LOOP;

  -- Run the discipline sweep once after draining (not per-case).
  IF v_cases_processed > 0 THEN
    PERFORM public.check_and_apply_member_discipline();
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'cases_processed', v_cases_processed,
    'errors', v_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_pending_case_waterfalls(INT) TO service_role;

COMMENT ON FUNCTION public.process_pending_case_waterfalls(INT) IS
'Drains case_waterfall_queue: runs the idempotent wallet waterfall for every obligated member of each pending case, then one discipline sweep. Safe to call from the api-trigger-waterfall edge function and from a scheduled job (recommended: every few minutes via pg_cron) as a safety net for cases whose frontend-triggered waterfall never ran.';

-- ── Part 5: backfill — enqueue existing payable cases missing a done entry ──
INSERT INTO public.case_waterfall_queue (case_id, status)
SELECT c.id, 'pending'
FROM public.cases c
WHERE (COALESCE(c.is_active, FALSE) OR COALESCE(c.is_finalized, FALSE))
  AND NOT EXISTS (
    SELECT 1 FROM public.case_waterfall_queue q
    WHERE q.case_id = c.id AND q.status = 'done'
  )
ON CONFLICT (case_id) DO NOTHING;

-- Recommended (run once, requires pg_cron):
--   SELECT cron.schedule('drain-case-waterfall', '*/5 * * * *',
--     $$ SELECT public.process_pending_case_waterfalls(20); $$);
