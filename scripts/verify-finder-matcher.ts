/**
 * Behavioural checks for lib/matching/finder.ts.
 *
 * Run: npx ts-node scripts/verify-finder-matcher.ts
 *
 * The repo has no test runner, and adding one is out of scope for this feature,
 * so this follows the existing scripts/ convention. The matcher is pure, so it
 * needs no database and no environment — which is most of the reason it was
 * written as a pure module.
 *
 * Covers the matching half of the build spec's §12 acceptance list, plus the
 * cases where this implementation deliberately departs from the spec.
 */

import './_alias';
import {
  matchFinderRequest,
  nearMissButtonLabel,
  nearMissStep,
  type FinderCandidate,
  type FinderCriteria,
} from '../lib/matching/finder';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// A Saturday 10:00 class: day 6, morning band -> saturday_morning.
const SAT_MORNING = [{ day: 6, time: '10:00', durationMin: 90 }];
// A Sunday 14:00 class -> sunday_afternoon.
const SUN_AFTERNOON = [{ day: 0, time: '14:00', durationMin: 90 }];

function candidate(overrides: Partial<FinderCandidate> = {}): FinderCandidate {
  return {
    groupId: 'g1',
    subject: 'CSEC Mathematics',
    formLevel: 'FORM_4',
    pricePerCourse: 250,
    scheduleEntries: SAT_MORNING,
    seatsRemaining: 4,
    tutorVerified: true,
    rating: 4.5,
    ...overrides,
  };
}

function criteria(overrides: Partial<FinderCriteria> = {}): FinderCriteria {
  return {
    subjectNames: ['Mathematics'],
    level: 'FORM_4',
    availabilityBlocks: ['saturday_morning'],
    budgetMax: 400,
    ...overrides,
  };
}

const MAX = 3;

console.log('\nFinder matcher — behavioural checks\n');

// ---------------------------------------------------------------- exact
{
  const r = matchFinderRequest([candidate()], criteria(), MAX);
  check('everything fits -> exact', r.matchClass === 'exact', `got ${r.matchClass}`);
  check('exact returns the class', r.matches.length === 1);
  check('exact has no near-miss dimension', r.nearMissOn === null);
}

// Free-text subject drift: the class says "CSEC Mathematics", the family picked
// "Mathematics". An id join would miss this; whole-word containment must not.
{
  const r = matchFinderRequest(
    [candidate({ subject: 'CAPE Pure Mathematics Unit 1', formLevel: 'CAPE' })],
    criteria({ level: 'CAPE' }),
    MAX
  );
  check('subject matches across free-text drift', r.matchClass === 'exact', `got ${r.matchClass}`);
}

// Verification is a ranking signal, NOT a gate — gating it cuts supply to 2.
{
  const r = matchFinderRequest([candidate({ tutorVerified: false })], criteria(), MAX);
  check('unverified tutor still matches (not a hard filter)', r.matchClass === 'exact', `got ${r.matchClass}`);
}

{
  const verified = matchFinderRequest([candidate()], criteria(), MAX).matches[0].score;
  const unverified = matchFinderRequest([candidate({ tutorVerified: false })], criteria(), MAX)
    .matches[0].score;
  check('verification still raises the score', verified > unverified, `${verified} vs ${unverified}`);
}

// ---------------------------------------------------------------- near
{
  const r = matchFinderRequest([candidate({ scheduleEntries: SUN_AFTERNOON })], criteria(), MAX);
  check('only the schedule misses -> near', r.matchClass === 'near', `got ${r.matchClass}`);
  check('near names the availability dimension', r.nearMissOn === 'availability', `got ${r.nearMissOn}`);
  check('button reads "Change my days"', nearMissButtonLabel('availability') === 'Change my days');
  check('availability near miss reopens step 2', nearMissStep('availability') === 2);
}

{
  const r = matchFinderRequest([candidate({ pricePerCourse: 900 })], criteria(), MAX);
  check('only the price misses -> near', r.matchClass === 'near', `got ${r.matchClass}`);
  check('near names the budget dimension', r.nearMissOn === 'budget', `got ${r.nearMissOn}`);
  check('button reads "Change my budget"', nearMissButtonLabel('budget') === 'Change my budget');
  check('budget near miss reopens step 4', nearMissStep('budget') === 4);
}

// An exact match must win over a near one rather than both being returned.
{
  const r = matchFinderRequest(
    [candidate({ groupId: 'near', scheduleEntries: SUN_AFTERNOON }), candidate({ groupId: 'exact' })],
    criteria(),
    MAX
  );
  check('an exact match suppresses the near ones', r.matchClass === 'exact');
  check('only the exact class is returned', r.matches.length === 1 && r.matches[0].groupId === 'exact');
}

// Disagreeing near misses cannot be described in one sentence or fixed by one
// button, so the honest answer is none.
{
  const r = matchFinderRequest(
    [
      candidate({ groupId: 'wrong_time', scheduleEntries: SUN_AFTERNOON }),
      candidate({ groupId: 'wrong_price', pricePerCourse: 900 }),
    ],
    criteria(),
    MAX
  );
  check('near misses on different dimensions -> none', r.matchClass === 'none', `got ${r.matchClass}`);
}

// ---------------------------------------------------------------- none
{
  const r = matchFinderRequest(
    [candidate({ scheduleEntries: SUN_AFTERNOON, pricePerCourse: 900 })],
    criteria(),
    MAX
  );
  check('two dimensions miss -> none', r.matchClass === 'none', `got ${r.matchClass}`);
  check('none returns no cards', r.matches.length === 0);
}

{
  const r = matchFinderRequest([], criteria(), MAX);
  check('no candidates -> none', r.matchClass === 'none');
}

// Spec §12.7 — a class with no resolved schedule must never present as exact.
{
  const r = matchFinderRequest([candidate({ scheduleEntries: [] })], criteria(), MAX);
  check('no schedule -> never exact', r.matchClass !== 'exact', `got ${r.matchClass}`);
}

// Even with the availability question skipped, an unschedulable class is out.
{
  const r = matchFinderRequest(
    [candidate({ scheduleEntries: [] })],
    criteria({ availabilityBlocks: [] }),
    MAX
  );
  check('no schedule -> not exact even with no availability asked', r.matchClass !== 'exact', `got ${r.matchClass}`);
}

// ---------------------------------------------------- hard filters
// A wrong-level class is not a near match, it is the wrong class.
{
  const r = matchFinderRequest([candidate({ formLevel: 'CAPE' })], criteria({ level: 'FORM_1' }), MAX);
  check('wrong level is excluded, not near', r.matchClass === 'none', `got ${r.matchClass}`);
}

// One class legitimately serves two levels — CSEC (14-16) spans Form 4 and 5.
{
  const r4 = matchFinderRequest([candidate({ formLevel: 'CSEC (14–16)' })], criteria({ level: 'FORM_4' }), MAX);
  const r5 = matchFinderRequest([candidate({ formLevel: 'CSEC (14–16)' })], criteria({ level: 'FORM_5' }), MAX);
  check('a CSEC band class serves Form 4', r4.matchClass === 'exact', `got ${r4.matchClass}`);
  check('the same class serves Form 5', r5.matchClass === 'exact', `got ${r5.matchClass}`);
}

{
  const r = matchFinderRequest([candidate({ subject: null })], criteria(), MAX);
  check('a class with no subject never matches', r.matchClass === 'none');
}

{
  const r = matchFinderRequest([candidate({ seatsRemaining: 0 })], criteria(), MAX);
  check('a full class is excluded', r.matchClass === 'none');
}

{
  const r = matchFinderRequest([candidate({ seatsRemaining: null })], criteria(), MAX);
  check('unknown capacity is not treated as full', r.matchClass === 'exact', `got ${r.matchClass}`);
}

// A free class is inside every budget, including the lowest band.
{
  const r = matchFinderRequest([candidate({ pricePerCourse: null })], criteria({ budgetMax: 200 }), MAX);
  check('a free class fits any budget', r.matchClass === 'exact', `got ${r.matchClass}`);
}

// The "$600+" band means no ceiling, not a $600 ceiling.
{
  const r = matchFinderRequest([candidate({ pricePerCourse: 5000 })], criteria({ budgetMax: null }), MAX);
  check('null budgetMax is no ceiling', r.matchClass === 'exact', `got ${r.matchClass}`);
}

// ---------------------------------------------------- ranking
{
  const r = matchFinderRequest(
    [
      candidate({ groupId: 'low', rating: 1 }),
      candidate({ groupId: 'high', rating: 5 }),
      candidate({ groupId: 'mid', rating: 3 }),
    ],
    criteria(),
    MAX
  );
  check('ranked by score descending', r.matches.map(m => m.groupId).join(',') === 'high,mid,low',
    r.matches.map(m => m.groupId).join(','));
}

{
  const many = Array.from({ length: 8 }, (_, i) => candidate({ groupId: `g${i}` }));
  const r = matchFinderRequest(many, criteria(), MAX);
  check('capped at maxMatches', r.matches.length === MAX, `got ${r.matches.length}`);
}

{
  const r = matchFinderRequest([candidate()], criteria(), MAX);
  check('reports the blocks the class covers', r.matches[0].blocks.join(',') === 'saturday_morning',
    r.matches[0].blocks.join(','));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
