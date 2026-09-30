/**
 * Behavioural checks for lib/classes/academicCalendar.ts — the school-year
 * maths behind the suggested class end date and the 1 July level move-up.
 *
 * Run: npm run calendar:verify
 *   (= npx ts-node --project scripts/tsconfig.verify.json scripts/verify-academic-calendar.ts)
 *
 * Pure module, so no database and no environment. Exits non-zero on the first
 * run that has any failure, listing every one.
 */

import './_alias';
import {
  levelAfter,
  maxClassEndDate,
  nextProgression,
  schoolYearOf,
  suggestEndDate,
} from '../lib/classes/academicCalendar';
import { inRotationWindow, isRotationDue, rotationWindowStart } from '../lib/classes/linkRotation';

const failures: string[] = [];
function eq(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Suggested end dates ────────────────────────────────────────────────────
const SUGGESTIONS: Array<[string, string, string | null]> = [
  ['FORM_4', '2026-09-28', '2028-04-30'],
  ['FORM_4', '2027-05-15', '2028-04-30'],
  ['FORM_4', '2027-07-01', '2029-04-30'],
  ['FORM_5', '2026-09-28', '2027-04-30'],
  ['FORM_5', '2027-04-30', '2028-04-30'], // not after today -> next sitting
  ['FORM_5', '2027-05-15', '2028-04-30'],
  ['FORM_2', '2027-05-15', '2027-06-30'], // 46 days away: keep
  ['FORM_2', '2027-05-31', '2027-06-30'], // exactly 30 days: keep
  ['FORM_2', '2027-06-01', '2028-06-30'], // 29 days: roll to next year
  ['FORM_2', '2027-06-30', '2028-06-30'], // today: roll
  ['FORM_1', '2026-09-28', '2027-06-30'],
  ['FORM_3', '2026-07-01', '2027-06-30'],
  ['CAPE', '2026-09-28', '2028-04-30'],
  ['SEA', '2026-09-28', null],
  ['', '2026-09-28', null],
  ['CSEC (14–16)', '2026-09-28', null],
];
for (const [level, today, expected] of SUGGESTIONS) {
  const s = suggestEndDate(level, today);
  eq(`suggestEndDate(${level || "''"}, ${today})`, s?.date ?? null, expected);
}

// Exhaustive: every day across three school years stays inside the cap and after today.
for (let t = Date.UTC(2026, 6, 1); t <= Date.UTC(2029, 5, 30); t += 86_400_000) {
  const today = new Date(t).toISOString().slice(0, 10);
  for (const level of ['FORM_1', 'FORM_2', 'FORM_3', 'FORM_4', 'FORM_5', 'CAPE']) {
    const s = suggestEndDate(level, today)!;
    if (s.date <= today) failures.push(`${level} on ${today} suggests ${s.date}, not after today`);
    if (s.date > maxClassEndDate(today)) failures.push(`${level} on ${today} suggests ${s.date}, past the cap ${maxClassEndDate(today)}`);
  }
}

// ── School-year boundary ───────────────────────────────────────────────────
eq('schoolYearOf(2027-06-30)', schoolYearOf('2027-06-30'), 2026);
eq('schoolYearOf(2027-07-01)', schoolYearOf('2027-07-01'), 2027);
eq('schoolYearOf(2026-12-31)', schoolYearOf('2026-12-31'), 2026);
eq('schoolYearOf(2027-01-01)', schoolYearOf('2027-01-01'), 2026);
eq('schoolYearOf(2028-02-29)', schoolYearOf('2028-02-29'), 2027);

// ── Cap arithmetic matches the API (UTC setUTCFullYear) ────────────────────
eq('maxClassEndDate(2028-02-29)', maxClassEndDate('2028-02-29'), '2030-03-01');
eq('maxClassEndDate(2026-09-28)', maxClassEndDate('2026-09-28'), '2028-09-28');

// ── Level ladder ───────────────────────────────────────────────────────────
eq('levelAfter(FORM_4, 1)', levelAfter('FORM_4', 1), 'FORM_5');
eq('levelAfter(FORM_1, 2)', levelAfter('FORM_1', 2), 'FORM_3');
eq('levelAfter(FORM_3, 5) caps at FORM_5', levelAfter('FORM_3', 5), 'FORM_5');
eq('levelAfter(FORM_5, 1)', levelAfter('FORM_5', 1), 'FORM_5');
eq('levelAfter(CAPE, 1)', levelAfter('CAPE', 1), 'CAPE');
eq('levelAfter(SEA, 1)', levelAfter('SEA', 1), 'SEA');
eq('levelAfter(CSEC (14–16), 1)', levelAfter('CSEC (14–16)', 1), 'CSEC (14–16)');
eq('levelAfter(FORM_2, 0)', levelAfter('FORM_2', 0), 'FORM_2');

// ── Next progression line ──────────────────────────────────────────────────
eq('nextProgression(FORM_4, 2026, 2028-04-30)', JSON.stringify(nextProgression('FORM_4', 2026, '2028-04-30')), JSON.stringify({ toLevel: 'FORM_5', on: '2027-07-01' }));
eq('nextProgression(FORM_2, 2026, 2027-06-30) ends first', nextProgression('FORM_2', 2026, '2027-06-30'), null);
eq('nextProgression(FORM_5, 2026)', nextProgression('FORM_5', 2026, null), null);

// ── Own-link rotation reminder (lib/classes/linkRotation.ts) ───────────────
eq('window start 2026-09-29', rotationWindowStart('2026-09-29'), '2026-09-28');
eq('window start 2026-09-27', rotationWindowStart('2026-09-27'), '2026-08-29');
eq('window start 2026-10-15', rotationWindowStart('2026-10-15'), '2026-09-28');
eq('window start 2027-01-05', rotationWindowStart('2027-01-05'), '2026-12-29');
eq('window start 2028-02-27 (leap)', rotationWindowStart('2028-02-27'), '2028-02-27');
eq('window start 2027-02-26', rotationWindowStart('2027-02-26'), '2027-02-26');
eq('in window 2026-09-30', inRotationWindow('2026-09-30'), true);
eq('in window 2026-09-27', inRotationWindow('2026-09-27'), false);
// 2026-09-29 18:00 Trinidad = 22:00Z. A link set on 2026-09-10 is due; one set on the 28th is not.
const at = new Date('2026-09-29T22:00:00Z');
eq('due: set 2026-09-10', isRotationDue('2026-09-10T15:00:00Z', at), true);
eq('not due: set 2026-09-28 in window', isRotationDue('2026-09-28T14:00:00Z', at), false);
eq('due: unknown age', isRotationDue(null, at), true);
// Trinidad date, not UTC: 2026-09-28 02:00Z is still the 27th in Trinidad, before the window.
eq('due: set 27th evening AST', isRotationDue('2026-09-28T02:00:00Z', at), true);
// Mid-October, a link rotated in the September window is not due again yet.
eq('not due mid-month after rotating', isRotationDue('2026-09-29T12:00:00Z', new Date('2026-10-15T15:00:00Z')), false);
// Ignored through October's window: due again from 29 Oct.
eq('due again next window', isRotationDue('2026-09-29T12:00:00Z', new Date('2026-10-29T15:00:00Z')), true);

if (failures.length) {
  console.error(`✗ ${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ academicCalendar: all checks passed');
