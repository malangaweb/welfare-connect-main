// Simulate the correct waterfall outcome for all 46 affected members
// Uses the same logic as member_case_obligation_applies + apply_wallet_payment_waterfall

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hfojxbfcjozguobwtcgt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhmb2p4YmZjam96Z3VvYnd0Y2d0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQxMDQzMiwiZXhwIjoyMDU3OTg2NDMyfQ.wqm4HmM2zPM1h3Eb17sELQz40Zsjp2ruAwBBroQaA1c'
);

function memberCaseObligationApplies(memberRegDate, caseStartDate, isActive, isFinalized) {
  if (!memberRegDate) return false;
  if (!isActive && !isFinalized) return false;
  const reg = new Date(memberRegDate);
  const start = new Date(caseStartDate);
  return start >= reg;  // case started on or after member registration
}

async function main() {
  // Get affected member IDs
  const { data: ptxns } = await supabase
    .from('transactions')
    .select('member_id')
    .eq('transaction_type', 'penalty')
    .gte('created_at', '2026-07-15T00:00:00Z')
    .lte('created_at', '2026-07-18T23:59:59Z');
  const affectedIds = [...new Set(ptxns.map(t => t.member_id))];

  // Get members
  const { data: members } = await supabase
    .from('members')
    .select('id, member_number, name, status, wallet_balance, registration_date')
    .in('id', affectedIds);

  const memberMap = {};
  for (const m of members) memberMap[m.id] = m;

  // Get ALL cases in the system
  const { data: allCases } = await supabase
    .from('cases')
    .select('id, case_number, contribution_per_member, is_active, is_finalized, start_date, created_at');

  // Get ALL transactions for affected members (all time, not just cascade)
  // We need this to calculate case obligations (contribution - already paid)
  const { data: allTxns } = await supabase
    .from('transactions')
    .select('member_id, transaction_type, amount, case_id')
    .in('member_id', affectedIds)
    .in('transaction_type', ['penalty', 'arrears', 'contribution', 'case_wallet_deduction', 'wallet_funding', 'contribution_refund', 'case_wallet_refund']);

  // Get cascade period transactions for wallet restoration calculation
  const { data: cascadeTxns } = await supabase
    .from('transactions')
    .select('member_id, transaction_type, amount, description, created_at')
    .in('member_id', affectedIds)
    .gte('created_at', '2026-07-15T00:00:00Z')
    .lte('created_at', '2026-07-18T23:59:59Z');

  // Build per-member structures
  const casePayments = {};  // member_id -> { case_id: total_paid }
  const memberPenalty = {}; // member_id -> { penalty: total, arrears: total, refund: total, deposit: total }
  const currentWallet = {}; // member_id -> current wallet balance

  for (const t of allTxns) {
    if (!casePayments[t.member_id]) casePayments[t.member_id] = {};
    if (t.case_id && ['contribution', 'case_wallet_deduction', 'arrears'].includes(t.transaction_type)) {
      casePayments[t.member_id][t.case_id] = (casePayments[t.member_id][t.case_id] || 0) + Math.abs(t.amount);
    }
    if (t.case_id && ['contribution_refund', 'case_wallet_refund'].includes(t.transaction_type)) {
      casePayments[t.member_id][t.case_id] = (casePayments[t.member_id][t.case_id] || 0) - Math.abs(t.amount);
    }
  }

  for (const m of members) {
    currentWallet[m.id] = m.wallet_balance || 0;
  }

  for (const t of cascadeTxns) {
    if (!memberPenalty[t.member_id]) memberPenalty[t.member_id] = { penalty: 0, arrears: 0, refund: 0, deposit: 0 };
    if (t.transaction_type === 'penalty') {
      memberPenalty[t.member_id].penalty += Math.abs(t.amount);
    } else if (t.transaction_type === 'arrears') {
      memberPenalty[t.member_id].arrears += Math.abs(t.amount);
    } else if (t.transaction_type === 'wallet_funding' && (t.description || '').includes('refund')) {
      memberPenalty[t.member_id].refund += Math.abs(t.amount);
    } else if (t.transaction_type === 'wallet_funding' && !(t.description || '').includes('refund')) {
      memberPenalty[t.member_id].deposit += Math.abs(t.amount);
    }
  }

  // Print header
  console.log('='.repeat(140));
  console.log('Member'.padEnd(22) + ' #'.padEnd(5) + 'Current'.padEnd(14) + 'Wallet'.padEnd(8) +
    'Pen'.padEnd(6) + 'Arr'.padEnd(6) + 'Ref'.padEnd(6) + 'Dep'.padEnd(7) +
    'Restored'.padEnd(10) + 'Cases'.padEnd(7) + '→ Status'.padEnd(12) + '→ Wallet'.padEnd(9) + 'Change');
  console.log('='.repeat(140));

  let probationCount = 0;
  let inactiveCount = 0;
  let statusChangeCount = 0;

  for (const m of members.sort((a, b) => (a.member_number || 0) - (b.member_number || 0))) {
    const mp = memberPenalty[m.id] || { penalty: 0, arrears: 0, refund: 0, deposit: 0 };
    const regDate = m.registration_date || m.created_at;

    // Compute restored wallet (after deleting cascade + heal transactions)
    const restoredWallet = (m.wallet_balance || 0) + mp.penalty + mp.arrears - mp.refund;

    // Find cases that apply to this member (member_case_obligation_applies logic)
    let applicableCases = [];
    for (const c of allCases) {
      const startDate = c.start_date || c.created_at?.split('T')[0];
      if (memberCaseObligationApplies(regDate, startDate, c.is_active, c.is_finalized)) {
        applicableCases.push(c);
      }
    }

    // Sort: finalized first, then active; then by case_date asc, created_at asc, id asc
    applicableCases.sort((a, b) => {
      const aFinal = a.is_finalized ? 0 : 1;
      const bFinal = b.is_finalized ? 0 : 1;
      if (aFinal !== bFinal) return aFinal - bFinal;
      const aDate = a.end_date || a.start_date || a.created_at;
      const bDate = b.end_date || b.start_date || b.created_at;
      return aDate.localeCompare(bDate);
    });

    // Simulate the correct waterfall
    let wallet = restoredWallet;
    let totalCaseReq = 0;
    let casesFullyPaid = 0;

    for (const c of applicableCases) {
      const paid = casePayments[m.id]?.[c.id] || 0;
      // Exclude cascade arrears payments since they'll be deleted
      const arrearsPaid = cascadeTxns
        .filter(t => t.member_id === m.id && t.transaction_type === 'arrears' && t.case_id === c.id)
        .reduce((s, t) => s + Math.abs(t.amount), 0);
      const effectivePaid = paid - arrearsPaid;

      const required = Number(c.contribution_per_member);
      const remaining = Math.max(required - effectivePaid, 0);
      const caseDate = c.end_date || c.start_date || c.created_at?.split('T')[0];

      if (remaining > 0) {
        totalCaseReq += required; // track for display
        if (wallet >= remaining) {
          wallet -= remaining;
          casesFullyPaid++;
        } else {
          break; // not enough for this case, skip remaining cases
        }
      }
    }

    // Pay penalty (up to 300, only for inactive members)
    let penaltyPaid = 0;
    if (wallet > 0) {
      penaltyPaid = Math.min(wallet, 300);
      wallet -= penaltyPaid;
    }

    const newStatus = penaltyPaid >= 300 ? 'probation' : 'inactive';
    const statusChanged = newStatus !== m.status;

    if (newStatus === 'probation') probationCount++;
    else inactiveCount++;
    if (statusChanged) statusChangeCount++;

    const changeMarker = statusChanged ? '★' : ({
      'probation:active': '',
      'probation:probation': '',
      'inactive:inactive': '',
      'inactive:inactive,inactive': ''
    }[`${newStatus}:${m.status}`] || '');

    console.log(
      (m.name || '?').substring(0, 20).padEnd(22) +
      String(m.member_number || '?').padStart(4).padEnd(5) +
      (m.status || '?').padEnd(14) +
      String(m.wallet_balance || 0).padStart(5).padEnd(8) +
      String(mp.penalty).padStart(4).padEnd(6) +
      String(mp.arrears).padStart(4).padEnd(6) +
      String(mp.refund).padStart(4).padEnd(6) +
      String(mp.deposit).padStart(4).padEnd(7) +
      String(restoredWallet).padStart(6).padEnd(10) +
      String(applicableCases.length).padStart(3).padEnd(7) +
      newStatus.padEnd(12) +
      String(wallet).padStart(5).padEnd(9) +
      (statusChanged ? ' ★' : '')
    );
  }

  console.log('='.repeat(140));
  console.log(`Summary: ${probationCount} probation, ${inactiveCount} inactive, ${statusChangeCount} status changes`);
  console.log(`Total members: ${probationCount + inactiveCount}`);
}

main().catch(console.error);
