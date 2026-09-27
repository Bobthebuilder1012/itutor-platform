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
import {
  matchesLocation,
  isLocationFilterActive,
  DEFAULT_LOCATION_FILTER,
} from '../lib/classes/locationFilter';
import {
  nearMissStep,
  questionPosition,
  questionSequence,
  formLevelLabelFor,
  validateAnswers,
  FINDER_LEVEL_LABELS,
  QUESTIONNAIRE_LEVELS,
  STEP,
} from '../lib/finder/wizard';

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

// ------------------------------------------- the pre-auth step sequence
// The wizard's question order is now derived rather than counted, because a
// TOTAL_STEPS constant could not express "parents get one more question" and the
// old clamp showed a parent "Question 1 of 6" on two consecutive screens.
{
  const student = questionSequence(false);
  const parent = questionSequence(true);

  check('a student answers 7 questions', student.length === 7, String(student.length));
  check('a parent answers 8', parent.length === 8, String(parent.length));
  check(
    'the parent sequence starts with the child question',
    parent[0] === STEP.CHILD,
    String(parent[0])
  );
  check(
    'LEVEL comes before SUBJECT — the subject list is a function of it',
    student.indexOf(STEP.LEVEL) < student.indexOf(STEP.SUBJECT)
  );
  check(
    'the picker is NOT a question',
    !student.includes(STEP.ROLE) && !parent.includes(STEP.ROLE)
  );

  // The reason the new steps took negative indices: these values ARE the ?step=
  // values in the URL, and renumbering would silently change what every
  // existing /find?step=N link means.
  check('SUBJECT is still 0', STEP.SUBJECT === 0);
  check('URGENCY is still 5', STEP.URGENCY === 5);
  check('the new steps are negative', STEP.ROLE < 0 && STEP.LEVEL < 0);

  const { index, total } = questionPosition(STEP.CHILD, true);
  check('a parent on the child question is 1 of 8', index === 0 && total === 8);
  const studentFirst = questionPosition(STEP.LEVEL, false);
  check('a student on the level question is 1 of 7',
    studentFirst.index === 0 && studentFirst.total === 7);
  check('the picker reports no position', questionPosition(STEP.ROLE, false).index === -1);
}

// --------------------------------------- the level -> profile vocabulary map
// Two vocabularies with a one-way lossy map. Guessing the sixth-form year would
// record a fact about a person that they never gave.
{
  check("SEA maps to signup's 'SEA'", formLevelLabelFor('SEA') === 'SEA');
  check('FORM_4 maps to "Form 4"', formLevelLabelFor('FORM_4') === 'Form 4');
  check('FORM_1 maps to "Form 1"', formLevelLabelFor('FORM_1') === 'Form 1');
  check(
    'CAPE maps to NOTHING, because Lower 6 and Upper 6 both normalise to it',
    formLevelLabelFor('CAPE') === null
  );
  check('a null level maps to null', formLevelLabelFor(null) === null);

  // Every value the wizard can offer must have a label, or the question renders
  // a blank row.
  const missing = QUESTIONNAIRE_LEVELS.filter(l => !FINDER_LEVEL_LABELS[l.value]);
  check('every offered level has a label', missing.length === 0,
    missing.map(m => m.value).join(','));
}

// ------------------------------------- what the anonymous validator accepts
{
  const valid = {
    subject: 'Mathematics',
    availabilityBlocks: ['saturday_morning'],
    lessonType: 'group',
    budgetBand: 'under_200',
    urgency: 'now',
  };

  check('a minimal answer set passes', validateAnswers(valid) === null,
    String(validateAnswers(valid)));
  check('level is optional', validateAnswers({ ...valid, level: null }) === null);
  check('a valid level passes', validateAnswers({ ...valid, level: 'FORM_4' }) === null);
  check('a junk level is rejected', validateAnswers({ ...valid, level: 'Form 4' }) === 'level');
  check('a junk role is rejected', validateAnswers({ ...valid, role: 'admin' }) === 'role');
  check('parent is a valid role', validateAnswers({ ...valid, role: 'parent' }) === null);

  // The endpoint is public now, so `subject` is the only unbounded free text
  // that reaches the database from an unauthenticated caller.
  const long = { ...valid, subject: 'x'.repeat(200) };
  check('an overlong subject is rejected', validateAnswers(long) === 'subject');
}

// ----------------------------------------- the location filter's one real rule
// "What can I attend from here", not "what has a venue here". The intuitive
// implementation makes every online class vanish from a town search, and the
// results still look plausible — so this is checked rather than eyeballed.
{
  const CHAG = 'region-chaguanas';
  const ARIMA = 'region-arima';
  const online = { classFormat: 'online' as const, venueRegionId: null };
  const roomHere = { classFormat: 'physical' as const, venueRegionId: CHAG };
  const roomAway = { classFormat: 'physical' as const, venueRegionId: ARIMA };
  const hybridHere = { classFormat: 'hybrid' as const, venueRegionId: CHAG };
  const legacy = { venueRegionId: null }; // pre-242: no class_format at all

  const anywhere = DEFAULT_LOCATION_FILTER;
  const inChag = { format: 'any' as const, regionId: CHAG, alsoShowOnline: true };
  const inChagRoomsOnly = { format: 'any' as const, regionId: CHAG, alsoShowOnline: false };

  check('Anywhere shows everything', [online, roomHere, roomAway, legacy]
    .every(c => matchesLocation(c, anywhere)));

  // THE TRAP.
  check('picking a town KEEPS online classes', matchesLocation(online, inChag));
  check('and keeps a room in that town', matchesLocation(roomHere, inChag));
  check('and drops a room in another town', !matchesLocation(roomAway, inChag));
  check('a hybrid class in the town is kept', matchesLocation(hybridHere, inChag));

  check('turning the toggle off drops online', !matchesLocation(online, inChagRoomsOnly));
  check('and keeps the room', matchesLocation(roomHere, inChagRoomsOnly));

  const inPerson = { format: 'in_person' as const, regionId: null, alsoShowOnline: true };
  check('"in person" drops online-only', !matchesLocation(online, inPerson));
  check('"in person" keeps hybrid — it has a room', matchesLocation(hybridHere, inPerson));

  // in-person + a region must not re-admit online, whatever the toggle says:
  // that would contradict the format the visitor just chose.
  const inPersonHere = { format: 'in_person' as const, regionId: CHAG, alsoShowOnline: true };
  check('"in person" + a town never re-admits online', !matchesLocation(online, inPersonHere));
  check('"in person" + a town keeps the room there', matchesLocation(roomHere, inPersonHere));

  const onlineOnly = { format: 'online' as const, regionId: null, alsoShowOnline: true };
  check('"online" drops a physical class', !matchesLocation(roomHere, onlineOnly));
  check('"online" keeps hybrid — it can be attended online', matchesLocation(hybridHere, onlineOnly));

  // Every class on production predates 242 and has no class_format.
  check('a class with no format counts as online', matchesLocation(legacy, onlineOnly));
  check('and survives a town search', matchesLocation(legacy, inChag));

  check('Anywhere is not an active filter', !isLocationFilterActive(anywhere));
  check('a region is', isLocationFilterActive(inChag));
  check('a format is', isLocationFilterActive(onlineOnly));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
