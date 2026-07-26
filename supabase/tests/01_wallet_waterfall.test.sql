-- pgTAP tests for the wallet ledger + payment waterfall + discipline engine.
--
-- Run locally with:
--   supabase db start                       # or any Postgres 15 with the schema
--   ./supabase/tests/run.sh
--
-- These are the highest-risk functions in the system (money movement and
-- member status automation). They previously churned through ~40 corrective
-- migrations, so they get first-class regression coverage here.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- Adjust the plan count if you add/remove assertions below.
SELECT plan(11);

-- ─────────────────────────────────────────────────────────────────────────
-- Fixtures: an isolated member with a known transaction history.
-- All rows are rolled back at COMMIT/ROLLBACK; nothing persists.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_member UUID := '00000000-0000-0000-0000-0000000000a1';
  v_case   UUID := '00000000-0000-0000-0000-0000000000b1';
BEGIN
  INSERT INTO public.members (id, member_number, name, phone_number, status, is_active, wallet_balance)
  VALUES (v_member, 'TEST-9001', 'Waterfall Test Member', '254700000001', 'active', TRUE, 0)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cases (id, case_number, case_type, contribution_per_member, is_active, is_finalized, start_date, created_at)
  VALUES (v_case, 'CASE-TEST-1', 'sickness', 500, TRUE, FALSE, CURRENT_DATE, now())
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ── calculate_wallet_balance ───────────────────────────────────────────────

-- Empty ledger => zero balance.
SELECT is(
  public.calculate_wallet_balance('00000000-0000-0000-0000-0000000000a1'),
  0::numeric,
  'calculate_wallet_balance: empty ledger returns 0'
);

-- Fund the wallet with 1000.
INSERT INTO public.transactions (member_id, amount, transaction_type, payment_method, status, description)
VALUES ('00000000-0000-0000-0000-0000000000a1', 1000, 'wallet_funding', 'mpesa', 'completed', 'test funding');

SELECT is(
  public.calculate_wallet_balance('00000000-0000-0000-0000-0000000000a1'),
  1000::numeric,
  'calculate_wallet_balance: funding credits the wallet'
);

-- A reversed funding must NOT count toward the balance.
INSERT INTO public.transactions (member_id, amount, transaction_type, payment_method, status, description)
VALUES ('00000000-0000-0000-0000-0000000000a1', 500, 'wallet_funding', 'mpesa', 'reversed', 'reversed funding');

SELECT is(
  public.calculate_wallet_balance('00000000-0000-0000-0000-0000000000a1'),
  1000::numeric,
  'calculate_wallet_balance: reversed transactions are excluded'
);

-- ── apply_wallet_payment_waterfall ─────────────────────────────────────────

-- Member has 1000 wallet, one active case requiring 500. Waterfall pays it.
SELECT lives_ok(
  $$ SELECT public.apply_wallet_payment_waterfall('00000000-0000-0000-0000-0000000000a1') $$,
  'apply_wallet_payment_waterfall: executes without error'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.transactions
    WHERE member_id = '00000000-0000-0000-0000-0000000000a1'
      AND case_id   = '00000000-0000-0000-0000-0000000000b1'
      AND transaction_type = 'case_wallet_deduction'
      AND status = 'completed'
  ),
  'waterfall: active case is paid via case_wallet_deduction'
);

SELECT is(
  public.calculate_wallet_balance('00000000-0000-0000-0000-0000000000a1'),
  500::numeric,
  'waterfall: wallet debited by the case amount (1000 - 500 = 500)'
);

-- Idempotency: running again must not double-pay the same case.
SELECT lives_ok(
  $$ SELECT public.apply_wallet_payment_waterfall('00000000-0000-0000-0000-0000000000a1') $$,
  'waterfall: second run executes'
);

SELECT is(
  (SELECT COUNT(*) FROM public.transactions
     WHERE member_id = '00000000-0000-0000-0000-0000000000a1'
       AND case_id   = '00000000-0000-0000-0000-0000000000b1'
       AND transaction_type = 'case_wallet_deduction')::int,
  1,
  'waterfall: is idempotent — case not paid twice'
);

SELECT is(
  public.calculate_wallet_balance('00000000-0000-0000-0000-0000000000a1'),
  500::numeric,
  'waterfall: balance unchanged on idempotent re-run'
);

-- ── deceased members are never charged ─────────────────────────────────────
UPDATE public.members SET status = 'deceased' WHERE id = '00000000-0000-0000-0000-0000000000a1';

SELECT is(
  (public.apply_wallet_payment_waterfall('00000000-0000-0000-0000-0000000000a1'))->>'skipped',
  'member_not_payable',
  'waterfall: deceased member is skipped'
);

-- ── discipline sweep function exists and is callable ───────────────────────
SELECT lives_ok(
  $$ SELECT * FROM public.check_and_apply_member_discipline() $$,
  'check_and_apply_member_discipline: runs without error'
);

SELECT * FROM finish();
ROLLBACK;
