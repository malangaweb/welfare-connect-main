-- pgTAP tests: discipline must NOT re-inactivate a reactivated (probation)
-- member for the SAME defaults they already paid the penalty to clear.
--
-- Regression for the "paid penalty but still inactive" bug: the sweep used to
-- count pre-reactivation unpaid cases, immediately re-inactivating members who
-- had just paid the reinstatement penalty (a ping-pong loop).

begin;

select plan(3);

-- Helper: build a synthetic case + membership linkage, reactivate, sweep, assert.
-- We use a fresh member and a case the member is obligated to.

create temp table if not exists _t(mid uuid, cid uuid);

do $$
declare v_mid uuid; v_cid uuid; v_before text; v_after text;
begin
  -- member registered long ago so any finalized case applies to them
  insert into public.members (member_number, name, status, is_active, wallet_balance, registration_date, gender)
    values (991001, 'DISC TEST', 'probation', true, 0, '2020-01-01', 'female') returning id into v_mid;

  insert into public.cases (case_number, is_finalized, contribution_per_member, start_date, created_at)
    values ('DISC-T1', true, 100, '2024-01-01', now() - interval '20 days') returning id into v_cid;

  -- Open reactivation cycle: reactivation AFTER the (historical) inactivation.
  insert into public.member_status_transitions
    (member_id, from_status, to_status, from_is_active, to_is_active, reason, performed_by_role)
    values (v_mid, 'inactive', 'probation', false, true, 'auto_wallet_reactivation', 'system');

  insert into _t values (v_mid, v_cid);
end; $$;

select lives_ok(
  $$ select public.check_and_apply_member_discipline(); $$,
  'discipline sweep runs without error on a reactivated member'
);

select is(
  (select status from public.members where member_number = 991001),
  'probation',
  'reactivated (probation) member is NOT re-inactivated for pre-reactivation defaults'
);

select ok(
  not exists (
    select 1 from public.member_status_transitions t
    join public.members m on m.id = t.member_id
    where m.member_number = 991001 and t.reason = 'auto_inactive_two_consecutive_defaults'
  ),
  'no new auto_inactive transition recorded for the reactivated member'
);

-- cleanup
do $$
declare v_mid uuid; v_cid uuid;
begin
  select mid, cid into v_mid, v_cid from _t limit 1;
  delete from public.member_status_transitions where member_id = v_mid;
  delete from public.cases where id = v_cid;
  delete from public.members where id = v_mid;
end; $$;

select * from finish();

rollback;
