/**
 * Behavioural checks for the monthly tutor payout cycle
 * (lib/payouts/payoutCycle.ts, the TypeScript twin of migration 266).
 *
 * Run: npm run payouts:verify
 *   (= npx ts-node --project scripts/tsconfig.verify.json scripts/verify-payout-cycle.ts)
 *
 * The database half — "generating a CSV marks nobody paid" and "the same
 * payment can't be paid twice" — needs real rows and lives in
 * supabase/_verify_payout_cycles.sql (runs inside a transaction, rolls back).
 * The checks below cover the TypeScript side of those two guarantees.
 */

import './_alias';
import {
  DUE_SOON_DAYS,
  advanceAfterConfirm,
  compareByUrgency,
  cycleDate,
  firstPayoutDate,
  isOwedNow,
  localDate,
  maskAccount,
  payoutDayFrom,
  payoutUrgency,
  type UrgencySortable,
} from '../lib/payouts/payoutCycle';

const failures: string[] = [];
let passed = 0;

function eq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// ── Payout day anchoring ─────────────────────────────────────────────────────
// First payment Jan 9, another enrolment Jan 20: payout day is the 9th and
// both are paid together on Feb 9. Feb 9–Mar 9 arrivals go out Mar 9.
{
  const anchor = '2026-01-09';
  eq('payout day from first payment', payoutDayFrom(anchor), 9);
  eq('first payout is the same day next month', firstPayoutDate(anchor), '2026-02-09');

  // Which payout does a payment received on date X go out in? The first
  // cycle on or after X — but never before the first payout.
  const payoutFor = (received: string) => {
    for (let n = 1; n < 36; n += 1) if (cycleDate(anchor, n) >= received) return cycleDate(anchor, n);
    return null;
  };
  eq('Jan 9 payment → Feb 9', payoutFor('2026-01-09'), '2026-02-09');
  eq('Jan 20 payment → Feb 9 (same bulk payout)', payoutFor('2026-01-20'), '2026-02-09');
  eq('Feb 10 payment → Mar 9', payoutFor('2026-02-10'), '2026-03-09');
  eq('Mar 9 payment → Mar 9', payoutFor('2026-03-09'), '2026-03-09');
  eq('cycle 2 is Mar 9', cycleDate(anchor, 2), '2026-03-09');
  eq('cycle 12 crosses the year', cycleDate(anchor, 12), '2027-01-09');

  // The second payment never moves the anchor: the payout day is a function
  // of the FIRST payment only.
  eq('a later payment does not change the day', payoutDayFrom(anchor), 9);
}

// ── Port of Spain calendar day ───────────────────────────────────────────────
// 02:30 UTC on Jan 10 is still Jan 9 in Trinidad (UTC−4).
eq('UTC early hours fall on the previous TT day', localDate('2026-01-10T02:30:00Z'), '2026-01-09');
eq('TT midday is the same day', localDate('2026-01-10T16:00:00Z'), '2026-01-10');

// ── Month-end clamping ───────────────────────────────────────────────────────
{
  const anchor = '2026-01-31';
  eq('payout day 31 stored as 31', payoutDayFrom(anchor), 31);
  eq('31st → Feb 28 in a common year', cycleDate(anchor, 1), '2026-02-28');
  eq('31st → back to Mar 31 (day not permanently changed)', cycleDate(anchor, 2), '2026-03-31');
  eq('31st → Apr 30', cycleDate(anchor, 3), '2026-04-30');
  eq('31st → May 31', cycleDate(anchor, 4), '2026-05-31');
  eq('31st → Feb 29 in a leap year', cycleDate('2027-01-31', 13), '2028-02-29');
  eq('30th → Feb 28', cycleDate('2026-01-30', 1), '2026-02-28');
  eq('30th → Mar 30', cycleDate('2026-01-30', 2), '2026-03-30');
  eq('29th → Feb 28 in a common year', cycleDate('2026-01-29', 1), '2026-02-28');
  eq('Dec 31 → Jan 31', cycleDate('2026-12-31', 1), '2027-01-31');
}

// ── Advancing after a confirmed payout ───────────────────────────────────────
{
  const anchor = '2026-01-09';
  eq('paid on the due date → next month',
    advanceAfterConfirm(anchor, '2026-02-09', '2026-02-09'),
    { nextPayoutOn: '2026-03-09', paidCycleOn: '2026-02-09' });
  eq('paid late → still the next month',
    advanceAfterConfirm(anchor, '2026-02-09', '2026-02-20'),
    { nextPayoutOn: '2026-03-09', paidCycleOn: '2026-02-09' });
  eq('paid more than a month late → skips the missed cycle',
    advanceAfterConfirm(anchor, '2026-02-09', '2026-03-15'),
    { nextPayoutOn: '2026-04-09', paidCycleOn: '2026-03-09' });
  // Early: the Mar 9 cycle is used up; money arriving Feb 20–Mar 9 waits for
  // Apr 9, so nobody is paid twice in one cycle. The day stays the 9th.
  eq('paid early → the covered cycle is consumed',
    advanceAfterConfirm(anchor, '2026-03-09', '2026-02-20'),
    { nextPayoutOn: '2026-04-09', paidCycleOn: '2026-03-09' });
  eq('clamped month advances back to the real day',
    advanceAfterConfirm('2026-01-31', '2026-02-28', '2026-02-28'),
    { nextPayoutOn: '2026-03-31', paidCycleOn: '2026-02-28' });
}

// ── Red / yellow / green boundaries ──────────────────────────────────────────
{
  const today = '2026-02-10';
  eq('DUE_SOON_DAYS is 7', DUE_SOON_DAYS, 7);
  eq('payout yesterday → overdue (red)', payoutUrgency('2026-02-09', today, 100), 'overdue');
  eq('payout a month ago → overdue (red)', payoutUrgency('2026-01-09', today, 100), 'overdue');
  eq('payout today → due soon (yellow)', payoutUrgency('2026-02-10', today, 100), 'due_soon');
  eq('payout in 7 days → due soon (yellow)', payoutUrgency('2026-02-17', today, 100), 'due_soon');
  eq('payout in 8 days → not due (green)', payoutUrgency('2026-02-18', today, 100), 'not_due');
  eq('overdue but nothing owed → nothing owed', payoutUrgency('2026-02-01', today, 0), 'nothing_owed');
  eq('threshold is configurable', payoutUrgency('2026-02-18', today, 100, 10), 'due_soon');
  eq('crosses a month boundary', payoutUrgency('2026-03-01', '2026-02-27', 5), 'due_soon');
}

// ── Sorting ──────────────────────────────────────────────────────────────────
{
  const t = (name: string, urgency: UrgencySortable['urgency'], next: string | null, owed = 100): UrgencySortable =>
    ({ name, urgency, next_payout_on: next, owed_ttd: owed });
  const sorted = [
    t('green-late', 'not_due', '2026-03-20'),
    t('none', 'nothing_owed', '2026-02-01', 0),
    t('yellow-later', 'due_soon', '2026-02-16'),
    t('red-recent', 'overdue', '2026-02-08'),
    t('green-early', 'not_due', '2026-02-25'),
    t('red-oldest', 'overdue', '2026-01-09'),
    t('yellow-sooner', 'due_soon', '2026-02-11'),
  ].sort(compareByUrgency).map((x) => x.name);
  eq('red (most overdue first) → yellow (soonest) → green → nothing owed', sorted, [
    'red-oldest', 'red-recent', 'yellow-sooner', 'yellow-later', 'green-early', 'green-late', 'none',
  ]);
}

// ── Generate CSV does not mark paid / double-payment (TypeScript side) ───────
// A row stamped into a batch — awaiting confirmation or already paid — is
// never "owed", so it can't be selected into a second CSV. Generating moves a
// row into a batch; it does not release it.
{
  eq('unbatched owed row is owed', isOwedNow({ status: 'owed', batch_id: null }), true);
  eq('unbatched release_ready row is owed', isOwedNow({ status: 'release_ready', batch_id: null }), true);
  eq('row in a generated (unconfirmed) CSV is not owed again',
    isOwedNow({ status: 'release_ready', batch_id: 'b1' }), false);
  eq('released row is not owed', isOwedNow({ status: 'released', batch_id: 'b1' }), false);
  eq('released row with batch cleared is still not owed', isOwedNow({ status: 'released', batch_id: null }), false);
  eq('reversed row is not owed', isOwedNow({ status: 'reversed', batch_id: null }), false);
  eq('admin_hold row is not owed', isOwedNow({ status: 'admin_hold', batch_id: null }), false);
  eq('refund-requested row is held out', isOwedNow({ status: 'owed', batch_id: null, refund_pending: true }), false);
  eq('unreleased secured spot is held out', isOwedNow({ status: 'owed', batch_id: null, secured_unreleased: true }), false);
}

// ── Masking ──────────────────────────────────────────────────────────────────
eq('mask keeps last 4', maskAccount('1234567890'), '••••7890');
eq('mask ignores spaces', maskAccount('12 3456 7890'), '••••7890');
eq('short value fully masked', maskAccount('123'), '••••');
eq('missing value', maskAccount(null), null);

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ payout cycle: ${passed} checks passed`);
