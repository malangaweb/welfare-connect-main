-- pgTAP tests for the case-waterfall delivery guarantee (queue + drain).
--
-- Verifies the fix for "auto case deduction not working in some places":
-- creating a payable case must ALWAYS enqueue waterfall work at the DB level,
-- independent of any frontend/edge-function call, and draining the queue must
-- apply the deduction idempotently.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(6);

-- Fixtures: a funded, obligated member + a fresh payable case.
DO $$
DECLARE
  v_member UUID := '00000000-0000-0000-0000-0000000000c1';
BEGIN
  INSERT INTO public.members (id, member_number, name, phone_number, status, is_active, wallet_balance, registration_date)
  VALUES (v_member, 'TEST-9101', 'Queue Test Member', '254700000101', 'active', TRUE, 0, CURRENT_DATE - 5)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.transactions (member_id, amount, transaction_type, payment_method, status, description)
  VALUES (v_member, 1000, 'wallet_funding', 'mpesa', 'completed', 'queue test funding');
END $$;

-- Inserting a payable case must enqueue exactly one pending queue row.
INSERT INTO public.cases (id, case_number, case_type, contribution_per_member, is_active, is_finalized, start_date, created_at)
VALUES ('00000000-0000-0000-0000-0000000000d1', 'CASE-Q-1', 'sickness', 400, TRUE, FALSE, CURRENT_DATE, now());

SELECT is(
  (SELECT status FROM public.case_waterfall_queue WHERE case_id = '00000000-0000-0000-0000-0000000000d1'),
  'pending',
  'case insert enqueues a pending waterfall job'
);

-- A non-payable case (neither active nor finalized) must NOT enqueue.
INSERT INTO public.cases (id, case_number, case_type, contribution_per_member, is_active, is_finalized, start_date, created_at)
VALUES ('00000000-0000-0000-0000-0000000000d2', 'CASE-Q-2', 'sickness', 400, FALSE, FALSE, CURRENT_DATE, now());

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.case_waterfall_queue WHERE case_id = '00000000-0000-0000-0000-0000000000d2'),
  'non-payable case does not enqueue'
);

-- Draining the queue applies the deduction for the obligated member.
SELECT lives_ok(
  $$ SELECT public.process_pending_case_waterfalls(50) $$,
  'process_pending_case_waterfalls runs without error'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.transactions
    WHERE member_id = '00000000-0000-0000-0000-0000000000c1'
      AND case_id   = '00000000-0000-0000-0000-0000000000d1'
      AND transaction_type = 'case_wallet_deduction'
      AND status = 'completed'
  ),
  'draining the queue deducts the case from the wallet'
);

SELECT is(
  (SELECT status FROM public.case_waterfall_queue WHERE case_id = '00000000-0000-0000-0000-0000000000d1'),
  'done',
  'processed queue row is marked done'
);

-- Idempotency: draining again must not double-charge.
SELECT is(
  (SELECT COUNT(*) FROM public.transactions
     WHERE member_id = '00000000-0000-0000-0000-0000000000c1'
       AND case_id   = '00000000-0000-0000-0000-0000000000d1'
       AND transaction_type = 'case_wallet_deduction')::int,
  1,
  'draining is idempotent — case not deducted twice'
);

SELECT * FROM finish();
ROLLBACK;
