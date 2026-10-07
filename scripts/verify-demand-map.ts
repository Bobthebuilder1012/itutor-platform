/**
 * Checks for the Demand Map arithmetic (lib/finder/demandMap.ts) and the
 * subject key (lib/finder/demandSubject.ts). No database.
 *
 *   npm run demand:verify
 */
import './_alias';
import { subjectKey, signalSubjectLabel } from '../lib/finder/demandSubject';
import { buildDemandMap, recommendedPrice, type DemandSignalRow } from '../lib/finder/demandMap';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

console.log('subjectKey');
check('class spelling = curriculum name', subjectKey('CSEC Mathematics') === subjectKey('Mathematics'));
check('(POB) suffix dropped', subjectKey('CSEC Principles of Business (POB)') === subjectKey('Principles of Business'));
check('& reads as and', subjectKey('Human & Social Biology') === subjectKey('Human and Social Biology'));
check('CAPE prefix dropped', subjectKey('CAPE Pure Mathematics Unit 1') === 'pure mathematics unit 1');
check('Add Maths stays distinct from Maths', subjectKey('CSEC Additional Mathematics') !== subjectKey('Mathematics'));
check('empty is empty', subjectKey(null) === '' && subjectKey('  ') === '');

console.log('signalSubjectLabel');
check('canonical name wins', signalSubjectLabel({ subject: { name: 'Mathematics' }, subject_text: 'CSEC Mathematics' }) === 'Mathematics');
check('falls back to the pick', signalSubjectLabel({ subject: null, subject_text: 'CSEC English B' }) === 'CSEC English B');
check('null when neither', signalSubjectLabel({ subject: null, subject_text: null }) === null);

console.log('recommendedPrice');
check('all $200 → 200', recommendedPrice([200, 200, 200]) === 200);
check('all no-limit → 600', recommendedPrice([null, null]) === 600);
check('3 of 4 at ≥400 → 400', recommendedPrice([200, 400, 600, null]) === 400);
check('half at 200 → 200', recommendedPrice([200, 200, 600, 600]) === 200);
check('empty → null', recommendedPrice([]) === null);

console.log('buildDemandMap');
let seq = 0;
function row(over: Partial<DemandSignalRow>): DemandSignalRow {
  seq += 1;
  return {
    id: `r${seq}`,
    user_id: null,
    subject_id: null,
    subject_text: null,
    level: 'FORM_5',
    availability_blocks: ['saturday_morning'],
    budget_max: 400,
    delivery_pref: 'online',
    match_class: 'none',
    notify_optin: false,
    resolved_at: null,
    created_at: `2026-10-0${(seq % 5) + 1}T10:00:00Z`,
    subject: null,
    request: null,
    ...over,
  };
}

const rows: DemandSignalRow[] = [
  row({ subject: { name: 'Mathematics' }, subject_text: 'Mathematics', match_class: 'exact' }),
  row({ subject_text: 'CSEC Mathematics', availability_blocks: ['weekday_evening', 'saturday_morning'] }),
  row({ subject_text: 'CSEC Mathematics', notify_optin: true, user_id: 'u1', budget_max: 200 }),
  row({ subject_text: 'CSEC Physics', notify_optin: true, notify_email: 'a@b.co', budget_max: null }),
  row({ subject_text: 'CSEC Physics', notify_optin: true }),
  row({ subject_text: null, level: 'CAPE', delivery_pref: 'in_person', match_class: 'fallback' }),
];
const contacts = new Map([['u1', { name: 'Ann Lee', email: 'ann@x.co', role: 'parent' }]]);
const map = buildDemandMap(rows, contacts, new Map(), false);

const maths = map.subjects.find(s => s.label === 'Mathematics');
check('maths spellings merge into one subject', maths?.total === 3, map.subjects.map(s => [s.label, s.total]));
check('maths unmet excludes the exact match', maths?.unmet === 2, maths);
check('subjects ranked by requests', map.subjects[0]?.label === 'Mathematics');
check('unknown subject is labelled, not dropped', map.subjects.some(s => s.label === 'Subject not recorded'));
check('saturday morning ranks first', map.times[0]?.key === 'saturday_morning', map.times);
check('time totals count every pick', map.times.reduce((a, t) => a + t.total, 0) === 7);
check('price bands ranked by count', map.prices[0]?.max === 400, map.prices);
check('$200 serves everyone', map.pricePoints.find(p => p.price === 200)?.servesShare === 1);
check('totals.unmet', map.totals.unmet === 5, map.totals);
check('notify list has 3', map.notifyList.length === 3);
const ann = map.notifyList.find(e => e.email === 'ann@x.co');
check('account email used, with name', ann?.name === 'Ann Lee' && ann.emailSource === 'account');
const typed = map.notifyList.find(e => e.email === 'a@b.co');
check('typed email used when no account', typed?.emailSource === 'typed' && typed.status === 'waiting');
check('opt-in without any address is flagged', map.notifyList.some(e => e.status === 'no_address'));
check('reachable count', map.totals.optInsReachable === 2 && map.totals.optInsNoAddress === 1, map.totals);
check('clusters split by year and format', map.clusters.length === 3, map.clusters.map(c => c.key));
check('cluster with opt-ins ranks first', map.clusters[0]?.optIns === 2, map.clusters[0]);
check('time grid covers 7 blocks', map.timeGrid.blocks.length === 7);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall demand-map checks pass');
