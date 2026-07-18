// Correct the old penalty-first cascade order for all 46 affected members
// Uses supabase client (service_role) to execute the correction

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hfojxbfcjozguobwtcgt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhmb2p4YmZjam96Z3VvYnd0Y2d0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQxMDQzMiwiZXhwIjoyMDU3OTg2NDMyfQ.wqm4HmM2zPM1h3Eb17sELQz40Zsjp2ruAwBBroQaA1c'
);

async function deleteWithCount(table, filters, label) {
  let query = supabase.from(table).select('id');
  for (const f of filters) {
    const col = f[0], op = f[1], val = f[2];
    if (op === 'in') query = query.in(col, val);
    else if (op === 'eq') query = query.eq(col, val);
    else if (op === 'gte') query = query.gte(col, val);
    else if (op === 'lte') query = query.lte(col, val);
    else if (op === 'ilike') query = query.ilike(col, val);
  }
  const { data: toDelete, error: selErr } = await query;
  if (selErr) { console.error(`  Error selecting ${label}: ${selErr.message}`); return 0; }
  if (!toDelete || toDelete.length === 0) { console.log(`  No ${label} to delete`); return 0; }

  const ids = toDelete.map(r => r.id);
  const { error: delErr } = await supabase.from(table).delete().in('id', ids);
  if (delErr) { console.error(`  Error deleting ${label}: ${delErr.message}`); return 0; }
  console.log(`  Deleted ${ids.length} ${label}`);
  return ids.length;
}

async function main() {
  console.log('=== CASCADE WATERFALL ORDER CORRECTION ===\n');

  // Step 0: Get affected member IDs
  const { data: ptxns } = await supabase
    .from('transactions').select('member_id')
    .eq('transaction_type', 'penalty')
    .gte('created_at', '2026-07-15T00:00:00Z')
    .lte('created_at', '2026-07-18T23:59:59Z');
  const affectedIds = [...new Set(ptxns.map(t => t.member_id))];
  console.log(`Affected members: ${affectedIds.length}`);

  const { data: members } = await supabase
    .from('members').select('id, member_number, name, status, wallet_balance')
    .in('id', affectedIds).order('member_number');

  // Step 1: Delete cascade penalty transactions (Jul 16-18)
  console.log('\n--- Step 1: Delete cascade penalty transactions ---');
  await deleteWithCount('transactions', [
    ['transaction_type', 'eq', 'penalty'],
    ['member_id', 'in', affectedIds],
    ['created_at', 'gte', '2026-07-16T00:00:00Z'],
    ['created_at', 'lte', '2026-07-18T23:59:59Z']
  ], 'penalty transactions');

  // Step 2: Delete cascade arrears transactions (Jul 16-18)
  console.log('\n--- Step 2: Delete cascade arrears transactions ---');
  await deleteWithCount('transactions', [
    ['transaction_type', 'eq', 'arrears'],
    ['member_id', 'in', affectedIds],
    ['created_at', 'gte', '2026-07-16T00:00:00Z'],
    ['created_at', 'lte', '2026-07-18T23:59:59Z']
  ], 'arrears transactions');

  // Step 3: Delete heal refund wallet_funding
  console.log('\n--- Step 3: Delete heal refund wallet_funding ---');
  await deleteWithCount('transactions', [
    ['transaction_type', 'eq', 'wallet_funding'],
    ['member_id', 'in', affectedIds],
    ['description', 'ilike', '%refund%']
  ], 'refund wallet_funding');

  // Step 4: Delete cascade/heal transitions
  console.log('\n--- Step 4: Delete cascade/heal transitions ---');
  await deleteWithCount('member_status_transitions', [
    ['member_id', 'in', affectedIds],
    ['reason', 'in', ['auto_wallet_reactivation', 'auto_inactive_two_consecutive_defaults']],
    ['created_at', 'gte', '2026-07-16T00:00:00Z'],
    ['created_at', 'lte', '2026-07-18T23:59:59Z']
  ], 'transitions');

  // Step 5: Reset members to inactive
  console.log('\n--- Step 5: Reset members to inactive ---');
  let inactiveCount = 0;
  for (const m of members) {
    const { error: errUpdate } = await supabase
      .from('members').update({ status: 'inactive', is_active: false, probation_end_date: null, updated_at: new Date().toISOString() })
      .eq('id', m.id);
    if (errUpdate) console.error(`  Error updating ${m.member_number}: ${errUpdate.message}`);
    else inactiveCount++;
  }
  console.log(`  Set ${inactiveCount}/${members.length} members to inactive`);

  // Step 6: Insert auto_inactive transitions
  console.log('\n--- Step 6: Insert auto_inactive transitions ---');
  let transitionCount = 0;
  for (const m of members) {
    const fromActive = m.status === 'active' || m.status === 'probation';
    const { error: errInsert } = await supabase
      .from('member_status_transitions').insert({
        member_id: m.id,
        from_status: m.status,
        to_status: 'inactive',
        from_is_active: fromActive,
        to_is_active: false,
        reason: 'auto_inactive_two_consecutive_defaults',
        details: { source: 'cascade_correction', prior_status: m.status, migration: '20260718001100' },
        performed_by_role: 'system'
      });
    if (errInsert) console.error(`  Error inserting transition for ${m.member_number}: ${errInsert.message}`);
    else transitionCount++;
  }
  console.log(`  Inserted ${transitionCount}/${members.length} transitions`);

  // Step 7: Apply the correct waterfall for each member
  console.log('\n--- Step 7: Apply correct (cases-first) waterfall ---');
  let probationCount = 0, inactiveFinalCount = 0, errorCount = 0;

  for (const m of members) {
    const beforeStatus = m.status;

    const { data: result, error: errRpc } = await supabase
      .rpc('apply_wallet_payment_waterfall', { p_member_id: m.id });

    if (errRpc) {
      console.error(`  [#${m.member_number}] ${m.name}: ERROR - ${errRpc.message}`);
      errorCount++;
      continue;
    }

    const flipped = result?.flipped_to === 'probation';
    if (flipped) probationCount++;
    else inactiveFinalCount++;

    const { data: updated } = await supabase
      .from('members').select('status, wallet_balance').eq('id', m.id).single();

    const statusChanged = (updated?.status || '?') !== beforeStatus;
    const log = `  [#${m.member_number}] ${(m.name||'?').substring(0,18).padEnd(18)}: ${beforeStatus} → ${updated?.status || '?'} wallet=${updated?.wallet_balance || 0}${statusChanged ? ' ★' : ''}`;
    console.log(log);
  }

  console.log(`\n=== CORRECTION COMPLETE ===`);
  console.log(`Probation: ${probationCount}, Inactive: ${inactiveFinalCount}, Errors: ${errorCount}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
