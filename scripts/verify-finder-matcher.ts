/**
 * Behavioural checks for lib/matching/finder.ts.
 *
 * Run: npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *        scripts/verify-finder-matcher.ts
 *
 * The compiler options are not optional. Under Node 20+ ts-node reparses this
 * file as an ES module (it detects `import` syntax), and ESM resolution then
 * refuses the extensionless `./_alias` import that the @/ path mapping depends
 * on. The plain `npx ts-node scripts/...` in the other scripts' headers fails
 * the same way on a current Node.
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
  type FinderCandidate,
  type FinderCriteria,
} from '../lib/matching/finder';
// nearMissStep moved to the wizard module, where the STEP map it has to agree
// with actually lives. It used to be in the matcher and was off by one in both
// directions, which these checks did not catch because they asserted the wrong
// numbers too.
import { nearMissStep, STEP } from '../lib/finder/wizard';

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
    monthlyPrice: 250,
    scheduleEntries: SAT_MORNING,
    classFormat: 'online',
    regionName: null,
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
    deliveryPref: 'online',
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
  check(
    'availability near miss reopens the availability step',
    nearMissStep('availability') === STEP.AVAILABILITY,
    `got ${nearMissStep('availability')}, STEP.AVAILABILITY is ${STEP.AVAILABILITY}`
  );
}

{
  const r = matchFinderRequest([candidate({ monthlyPrice: 900 })], criteria(), MAX);
  check('only the price misses -> near', r.matchClass === 'near', `got ${r.matchClass}`);
  check('near names the budget dimension', r.nearMissOn === 'budget', `got ${r.nearMissOn}`);
  check('button reads "Change my budget"', nearMissButtonLabel('budget') === 'Change my budget');
  check(
    'budget near miss reopens the budget step',
    nearMissStep('budget') === STEP.BUDGET,
    `got ${nearMissStep('budget')}, STEP.BUDGET is ${STEP.BUDGET}`
  );
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
      candidate({ groupId: 'wrong_price', monthlyPrice: 900 }),
    ],
    criteria(),
    MAX
  );
  check('near misses on different dimensions are not "near"', r.matchClass !== 'near', `got ${r.matchClass}`);
}

// ---------------------------------------------------------------- none
{
  const r = matchFinderRequest(
    [candidate({ scheduleEntries: SUN_AFTERNOON, monthlyPrice: 900 })],
    criteria(),
    MAX
  );
  check('two dimensions miss -> not exact, not near', r.matchClass !== 'exact' && r.matchClass !== 'near', `got ${r.matchClass}`);
  check('the subject fallback still offers something', r.matches.length > 0);
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
  check('wrong level never presents as near', r.matchClass !== 'near' && r.matchClass !== 'exact', `got ${r.matchClass}`);
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
  const r = matchFinderRequest([candidate({ monthlyPrice: null })], criteria({ budgetMax: 200 }), MAX);
  check('a free class fits any budget', r.matchClass === 'exact', `got ${r.matchClass}`);
}

// The "$600+" band means no ceiling, not a $600 ceiling.
{
  const r = matchFinderRequest([candidate({ monthlyPrice: 5000 })], criteria({ budgetMax: null }), MAX);
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


// ------------------------------------------- subject trumps all (fallback)
// The user-facing rule: minimise empty screens. If nothing survives the strict
// pass, show classes in the subject anyway rather than nothing.
{
  // Wrong day AND over budget — two misses, so pre-fallback this was `none`.
  const r = matchFinderRequest(
    [candidate({ scheduleEntries: SUN_AFTERNOON, monthlyPrice: 900 })],
    criteria(),
    MAX
  );
  check('two misses now fall back rather than none', r.matchClass === 'fallback', `got ${r.matchClass}`);
  check('fallback still returns the class', r.matches.length === 1);
}

{
  // Wrong LEVEL is a hard filter in the strict pass, but the subject still
  // matches — so the fallback should surface it rather than showing nothing.
  const r = matchFinderRequest([candidate({ formLevel: 'CAPE' })], criteria({ level: 'FORM_1' }), MAX);
  check('wrong level falls back on subject', r.matchClass === 'fallback', `got ${r.matchClass}`);
}

{
  // Disagreeing near misses used to be `none`; they are now a fallback, because
  // both classes are in the subject the family asked for.
  const r = matchFinderRequest(
    [
      candidate({ groupId: 'wrong_time', scheduleEntries: SUN_AFTERNOON }),
      candidate({ groupId: 'wrong_price', monthlyPrice: 900 }),
    ],
    criteria(),
    MAX
  );
  check('disagreeing near misses fall back', r.matchClass === 'fallback', `got ${r.matchClass}`);
}

{
  // The ONLY true no-match: nothing in the subject at all.
  const r = matchFinderRequest([candidate({ subject: 'Geography' })], criteria(), MAX);
  check('a different subject is still none', r.matchClass === 'none', `got ${r.matchClass}`);
}

{
  // Capacity stays hard even in the fallback — a full class is not an option at
  // any level of desperation.
  const r = matchFinderRequest(
    [candidate({ formLevel: 'CAPE', seatsRemaining: 0 })],
    criteria({ level: 'FORM_1' }),
    MAX
  );
  check('a full class is excluded from the fallback too', r.matchClass === 'none', `got ${r.matchClass}`);
}

{
  // A class with no schedule cannot be attended, so it is not a fallback either.
  const r = matchFinderRequest(
    [candidate({ formLevel: 'CAPE', scheduleEntries: [] })],
    criteria({ level: 'FORM_1' }),
    MAX
  );
  check('an unschedulable class is not a fallback', r.matchClass === 'none', `got ${r.matchClass}`);
}

{
  // An exact match must still win outright — the fallback is a last resort, not
  // an additive tier.
  const r = matchFinderRequest(
    [candidate({ groupId: 'exact' }), candidate({ groupId: 'wrong_level', formLevel: 'CAPE' })],
    criteria(),
    MAX
  );
  check('exact wins over anything the fallback would add', r.matchClass === 'exact');
  check('fallback candidates are not mixed in', r.matches.length === 1 && r.matches[0].groupId === 'exact');
}

// ------------------------------------------- weekday mornings are matchable
// Not every learner is in the standard school timetable — home-schoolers, shift
// systems, CAPE free periods, resits.
{
  const WEEKDAY_MORNING = [{ day: 3, time: '09:00', durationMin: 90 }];
  const r = matchFinderRequest(
    [candidate({ scheduleEntries: WEEKDAY_MORNING })],
    criteria({ availabilityBlocks: ['weekday_morning'] }),
    MAX
  );
  check('a weekday morning class matches a weekday morning request', r.matchClass === 'exact', `got ${r.matchClass}`);
  check('and reports the weekday_morning block', r.matches[0]?.blocks.join(',') === 'weekday_morning',
    r.matches[0]?.blocks.join(','));
}

// ----------------------------------------------------- delivery: online vs venue
// Migration 242 made classes physical, hybrid or online. Before it, this
// dimension could not be wrong because there was only one answer.
{
  const r = matchFinderRequest(
    [candidate({ classFormat: 'physical', regionName: 'San Fernando' })],
    criteria({ deliveryPref: 'online' }),
    MAX
  );
  check('a physical class is not an exact match for an online request',
    r.matchClass === 'near', `got ${r.matchClass}`);
  check('and the miss is named as delivery', r.nearMissOn === 'delivery', String(r.nearMissOn));
  check('delivery near miss reopens the delivery step',
    nearMissStep('delivery') === STEP.DELIVERY,
    `got ${nearMissStep('delivery')}, STEP.DELIVERY is ${STEP.DELIVERY}`);
  check('and offers a button that widens rather than narrows',
    nearMissButtonLabel('delivery') === 'Show me online classes too');
}

{
  const r = matchFinderRequest(
    [candidate({ classFormat: 'online' })],
    criteria({ deliveryPref: 'in_person' }),
    MAX
  );
  check('an online class is not an exact match for an in-person request',
    r.matchClass === 'near' && r.nearMissOn === 'delivery', `got ${r.matchClass}/${r.nearMissOn}`);
}

{
  // The whole point of hybrid: it satisfies both, so neither request is a miss.
  const online = matchFinderRequest(
    [candidate({ classFormat: 'hybrid' })],
    criteria({ deliveryPref: 'online' }),
    MAX
  );
  const inPerson = matchFinderRequest(
    [candidate({ classFormat: 'hybrid', regionName: 'Arima' })],
    criteria({ deliveryPref: 'in_person' }),
    MAX
  );
  check('a hybrid class satisfies an online request', online.matchClass === 'exact', online.matchClass);
  check('a hybrid class satisfies an in-person request', inPerson.matchClass === 'exact', inPerson.matchClass);
}

{
  const r = matchFinderRequest(
    [candidate({ classFormat: 'physical' })],
    criteria({ deliveryPref: 'either' }),
    MAX
  );
  check("'either' does not gate on delivery", r.matchClass === 'exact', r.matchClass);
}

{
  // Historical runs (before migration 243) have no preference recorded. They
  // must not acquire a phantom near miss retrospectively.
  const r = matchFinderRequest(
    [candidate({ classFormat: 'physical' })],
    criteria({ deliveryPref: null }),
    MAX
  );
  check('a null deliveryPref is unconstrained', r.matchClass === 'exact', r.matchClass);
}

{
  // Every class on production predates migration 242 and has a null format.
  // Treating that as unknown-and-exclude would empty the catalogue.
  const r = matchFinderRequest(
    [candidate({ classFormat: null })],
    criteria({ deliveryPref: 'online' }),
    MAX
  );
  check('a null class_format counts as online', r.matchClass === 'exact', r.matchClass);
}

{
  // Two misses on different dimensions has no honest single sentence, so it
  // must fall through to the subject-only pass rather than picking one.
  const r = matchFinderRequest(
    [
      candidate({ groupId: 'wrong_format', classFormat: 'physical' }),
      candidate({ groupId: 'wrong_price', monthlyPrice: 900 }),
    ],
    criteria({ deliveryPref: 'online' }),
    MAX
  );
  check('disagreeing near misses do not name a dimension', r.matchClass !== 'near', r.matchClass);
  check('and subject still trumps, so something is shown', r.matches.length > 0);
}

{
  // Delivery outranks budget: another $50 a month is findable, another ferry is
  // not. Both candidates miss exactly one dimension, so both are near misses —
  // this checks the ORDER, using two separate runs.
  const overBudget = matchFinderRequest(
    [candidate({ monthlyPrice: 900 })], criteria(), MAX
  ).matches[0].score;
  const wrongFormat = matchFinderRequest(
    [candidate({ classFormat: 'physical' })], criteria(), MAX
  ).matches[0].score;
  check('an over-budget class outranks a wrong-format one',
    overBudget > wrongFormat, `${overBudget} vs ${wrongFormat}`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
