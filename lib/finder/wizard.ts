/**
 * The wizard's vocabulary: the options each step offers, and how an answer set
 * is validated.
 *
 * Shared by the client wizard and the submit route on purpose. The route must
 * re-validate everything the client collected — a POST is a public surface even
 * behind auth, and `finder_requests` has CHECK constraints that would 500 rather
 * than reject politely if junk reached them.
 *
 * THE LEVEL IS ASKED AGAIN — because there may be no account to ask it of.
 *
 * This reverses what this file used to say. The old rule was "the level is
 * already collected at account creation (`profiles.form_level`), so asking a
 * second time reads as though the first answer was thrown away." That was right
 * while the Finder sat AFTER signup. It now runs before, so pre-auth there is no
 * profile to read and the question has to be asked. The rule inverts rather than
 * breaks: where a session DOES exist the profile still wins, the level step is
 * skipped, and signup is prefilled from the wizard's answer instead of the other
 * way round.
 *
 * The consequence for step order is unchanged and now load-bearing: subject
 * options come from `subjectsForLevel(level)`, so the level question must come
 * FIRST. The subject step literally cannot render its options until it is
 * answered.
 */

import {
  AVAILABILITY_BLOCKS,
  AVAILABILITY_BLOCK_VALUES,
  type AvailabilityBlock,
} from '@/lib/matching/availability';
import { QUESTIONNAIRE_LEVELS, type CanonicalLevel } from '@/lib/matching/levels';
import {
  DELIVERY_PREFS,
  DELIVERY_PREF_VALUES,
  type DeliveryPref,
} from '@/lib/matching/delivery';
import type { GatingDimension } from '@/lib/matching/finder';

export const LEVEL_VALUES: ReadonlySet<string> = new Set(
  QUESTIONNAIRE_LEVELS.map(l => l.value)
);

/**
 * Labels for the level question, local to the Finder.
 *
 * `QUESTIONNAIRE_LEVELS`' own labels are bare (`SEA`, `CAPE`) and are rendered
 * live by Class Match Week's questionnaire, so they are not ours to change —
 * editing them would silently change a running campaign's screens. These add the
 * context a parent actually thinks in: "Standard 4-5", "CSEC", "Lower or Upper
 * 6".
 *
 * The seven canonical values are offered rather than signup's eight, because
 * `finder_requests.level` stores a CanonicalLevel and
 * `normaliseLearnerLevel('Lower 6')` is `'CAPE'` — so an eight-option list
 * collapses to seven in storage anyway, and offering a distinction the system
 * immediately discards is the exact failure this file used to warn about. The
 * sixth-form year is a real fact, so signup asks for it separately; see
 * `formLevelLabelFor` below.
 */
export const FINDER_LEVEL_LABELS: Record<CanonicalLevel, string> = {
  SEA: 'SEA (Standard 4–5)',
  FORM_1: 'Form 1',
  FORM_2: 'Form 2',
  FORM_3: 'Form 3',
  FORM_4: 'Form 4 · CSEC',
  FORM_5: 'Form 5 · CSEC',
  CAPE: 'CAPE (Lower or Upper 6)',
};

/**
 * The `profiles.form_level` value for a canonical level, or null when there is
 * no single honest answer.
 *
 * Six of the seven map one-to-one onto signup's `YEAR_LEVELS`. `CAPE` does not:
 * both `Lower 6` and `Upper 6` normalise to it (lib/matching/levels.ts), so
 * there is no inverse. Returning null rather than guessing is the point —
 * signup's year dropdown is then left for the visitor to complete, which is one
 * genuine extra question, where a guess would be a wrong fact recorded about a
 * person and used to match them for as long as the account exists.
 */
export function formLevelLabelFor(level: CanonicalLevel | null): string | null {
  if (!level) return null;
  if (level === 'CAPE') return null;
  if (level === 'SEA') return 'SEA';
  return `Form ${level.slice('FORM_'.length)}`;
}

export type LessonType = 'group' | 'one_on_one' | 'either';
export type Urgency = 'now' | 'this_month' | 'exploring';

export const LESSON_TYPES: ReadonlyArray<{
  value: LessonType;
  label: string;
  detail: string;
}> = [
  {
    value: 'group',
    label: 'A group class',
    detail: 'Learn alongside a few other students. Costs less and runs to a set weekly timetable.',
  },
  {
    value: 'one_on_one',
    label: 'One-to-one',
    detail: 'A tutor to yourself, at a time you arrange together.',
  },
  {
    value: 'either',
    label: 'Either is fine',
    detail: "Show me whatever fits best — I don't mind which.",
  },
];

/**
 * Monthly budget ceilings in TTD.
 *
 * THE LABELS SAY "UP TO", BECAUSE THAT IS WHAT THE MATCHER DOES. `max` is a
 * ceiling and nothing reads a floor, so picking "$400 – $600" always admitted
 * everything under $600 too. The old banded labels implied a floor the logic
 * never had, which quietly narrowed what families believed they were asking for
 * and made "no results" look like a supply problem rather than a wording one.
 *
 * `null` on the top option means no ceiling at all.
 */
export const BUDGET_BANDS: ReadonlyArray<{
  value: string;
  label: string;
  detail?: string;
  max: number | null;
}> = [
  { value: 'under_200', label: 'Up to $200 a month', max: 200 },
  { value: '200_400', label: 'Up to $400 a month', max: 400 },
  { value: '400_600', label: 'Up to $600 a month', max: 600 },
  { value: '600_plus', label: 'No limit', detail: 'Show me everything', max: null },
];

export const URGENCIES: ReadonlyArray<{ value: Urgency; label: string }> = [
  { value: 'now', label: 'Right away' },
  { value: 'this_month', label: 'This month' },
  { value: 'exploring', label: 'Just looking' },
];

/** What the wizard collects. Null means "not answered yet". */
export interface FinderAnswers {
  /** Parent flow only: the child's first name, typed, no account needed. */
  childLabel: string | null;
  /** Asked pre-auth; read from the profile when there is a session. */
  level: CanonicalLevel | null;
  subject: string | null;
  availabilityBlocks: AvailabilityBlock[];
  lessonType: LessonType | null;
  /** Online / in person / either. Asked because migration 242 made it a real
   *  question — before that every class was online and there was one answer. */
  deliveryPref: DeliveryPref | null;
  budgetBand: string | null;
  urgency: Urgency | null;
}

export function emptyAnswers(): FinderAnswers {
  return {
    childLabel: null,
    level: null,
    subject: null,
    availabilityBlocks: [],
    lessonType: null,
    deliveryPref: null,
    budgetBand: null,
    urgency: null,
  };
}

/**
 * Step indices, so nothing has to hardcode a magic number.
 *
 * These ARE the `?step=` values in the URL — the wizard reads the param
 * straight into this space rather than offsetting it. Anything that links to a
 * step must use this map; the one thing that hardcoded the numbers instead
 * (nearMissStep, formerly in lib/matching/finder.ts) was off by one in both
 * directions and sent the family to the wrong question.
 *
 * DELIVERY sits next to LESSON_TYPE because they are the two "what shape is
 * this lesson" questions, and answering them together reads as one thought
 * rather than two interruptions.
 */
export const STEP = {
  ROLE: -3, // the picker, rendered inline when /find arrives with no ?role=
  CHILD: -2, // parents only
  LEVEL: -1, // must precede SUBJECT: the subject list is a function of it
  SUBJECT: 0,
  AVAILABILITY: 1,
  LESSON_TYPE: 2,
  DELIVERY: 3,
  BUDGET: 4,
  URGENCY: 5,
} as const;

/**
 * THE NEW STEPS TOOK NEGATIVE INDICES ON PURPOSE.
 *
 * These values ARE the `?step=` values in the URL. Inserting ROLE and LEVEL at
 * the front by renumbering SUBJECT to 2 would have silently changed the meaning
 * of every `/find?step=N` link already in a browser history, a bookmark or an
 * email — `?step=3` would stop being DELIVERY and start being LESSON_TYPE, with
 * no error anywhere. `CHILD: -1` had already established that a step before the
 * first numbered one takes a negative index; this just uses two more of them, so
 * not one existing URL moves.
 */

/**
 * The ordered questions for a role.
 *
 * THE PROGRESS INDICATOR IS DERIVED FROM THIS. It used to come from a
 * `TOTAL_STEPS = 6` constant plus `Math.max(0, step)`, and both were wrong: the
 * real count is 7 for a student and 8 for a parent, and the clamp collapsed
 * CHILD (-1) onto SUBJECT (0) so **a parent saw "Question 1 of 6" on two
 * consecutive screens** with the first bar filled on both. A constant cannot
 * express "parents get one more question", so there is no constant any more.
 *
 * STEP.ROLE is deliberately absent. It is a fork, not a question — counting it
 * would promise one more answer than we ask for, and it is not something the
 * visitor can go "back" to a previous question from.
 */
export function questionSequence(isParent: boolean): number[] {
  const tail = [
    STEP.LEVEL,
    STEP.SUBJECT,
    STEP.AVAILABILITY,
    STEP.LESSON_TYPE,
    STEP.DELIVERY,
    STEP.BUDGET,
    STEP.URGENCY,
  ];
  return isParent ? [STEP.CHILD, ...tail] : tail;
}

/**
 * Where this step sits in the sequence. `index === -1` means "not a question" —
 * the ROLE picker, or an out-of-range `?step=` — and the caller should render no
 * progress at all rather than a misleading position.
 */
export function questionPosition(
  step: number,
  isParent: boolean
): { seq: number[]; index: number; total: number } {
  const seq = questionSequence(isParent);
  return { seq, index: seq.indexOf(step), total: seq.length };
}

/**
 * Which wizard step a near miss sends the family back to.
 *
 * Lives here, not in the matcher, because it has to agree with STEP above and
 * cannot be checked by anything if it lives a directory away.
 */
export function nearMissStep(dimension: GatingDimension): number {
  if (dimension === 'availability') return STEP.AVAILABILITY;
  if (dimension === 'budget') return STEP.BUDGET;
  return STEP.DELIVERY;
}

/**
 * Is this step answered? Drives the Continue button, which stays visible but
 * disabled — a disabled button shows what is expected next, where a hidden one
 * just looks broken.
 */
export function isStepAnswered(
  step: number,
  answers: FinderAnswers,
  isParent: boolean
): boolean {
  switch (step) {
    case STEP.CHILD:
      return !isParent || (answers.childLabel ?? '').trim().length > 0;
    case STEP.LEVEL:
      return answers.level !== null;
    case STEP.SUBJECT:
      return answers.subject !== null;
    case STEP.AVAILABILITY:
      return answers.availabilityBlocks.length > 0;
    case STEP.LESSON_TYPE:
      return answers.lessonType !== null;
    case STEP.DELIVERY:
      return answers.deliveryPref !== null;
    case STEP.BUDGET:
      return answers.budgetBand !== null;
    case STEP.URGENCY:
      return answers.urgency !== null;
    default:
      return false;
  }
}

export function budgetMaxFor(band: string | null): number | null {
  if (!band) return null;
  return BUDGET_BANDS.find(b => b.value === band)?.max ?? null;
}

export function availabilityLabel(block: AvailabilityBlock): string {
  return AVAILABILITY_BLOCKS.find(b => b.value === block)?.label ?? block;
}

/** Chip copy for a recorded delivery preference. */
export function deliveryPrefLabel(pref: string | null): string {
  return DELIVERY_PREFS.find(p => p.value === pref)?.label ?? 'Online or in person';
}

export { DELIVERY_PREFS };
export type { DeliveryPref };

/**
 * Server-side validation of a submitted answer set.
 *
 * Returns the field name that failed, or null when everything is acceptable.
 * Deliberately strict about closed vocabularies: an unrecognised block is junk,
 * not a new block we should quietly record.
 *
 * `level` IS validated here now. It used to be read from the profile and left
 * out of the submission entirely; pre-auth there is no profile, so it arrives in
 * the body and has to be checked against the closed vocabulary like everything
 * else. An authed run may still omit it, in which case the route falls back to
 * the profile — so it is optional on the wire but never free text.
 *
 * The endpoint is now ANONYMOUS AND PUBLIC. It sees whatever arrives, not what
 * the form intended to send, which is why `subject` gained a length cap: it is
 * the only unbounded free text that reaches the database from here.
 */
export function validateAnswers(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return 'body';
  const a = input as Record<string, unknown>;

  if (typeof a.subject !== 'string' || a.subject.trim().length === 0) return 'subject';
  // 120 is comfortably longer than the longest real subject
  // ("CAPE Caribbean Studies Unit 1" is 29) and short enough that a megabyte of
  // junk cannot be stored by an unauthenticated caller.
  if (a.subject.length > 120) return 'subject';

  if (a.level !== null && a.level !== undefined) {
    if (typeof a.level !== 'string' || !LEVEL_VALUES.has(a.level)) return 'level';
  }

  // The picker's answer. Only these two roles run the questionnaire — a tutor
  // goes straight to signup — and the value is CHECK-constrained in the database
  // because claimTokenRow copies it onto profiles.role.
  if (a.role !== null && a.role !== undefined) {
    if (a.role !== 'student' && a.role !== 'parent') return 'role';
  }

  if (!Array.isArray(a.availabilityBlocks) || a.availabilityBlocks.length === 0) {
    return 'availabilityBlocks';
  }
  for (const block of a.availabilityBlocks) {
    if (typeof block !== 'string' || !AVAILABILITY_BLOCK_VALUES.has(block)) {
      return 'availabilityBlocks';
    }
  }

  if (typeof a.lessonType !== 'string' || !LESSON_TYPES.some(t => t.value === a.lessonType)) {
    return 'lessonType';
  }

  // Accepted as absent as well as valid. A client built before migration 243
  // (a cached bundle, a queued request) posts no deliveryPref, and rejecting
  // that would 400 a family whose only fault is a stale tab. Absent records as
  // null, which the matcher reads as unconstrained.
  if (a.deliveryPref !== null && a.deliveryPref !== undefined) {
    if (typeof a.deliveryPref !== 'string' || !DELIVERY_PREF_VALUES.has(a.deliveryPref)) {
      return 'deliveryPref';
    }
  }
  if (typeof a.budgetBand !== 'string' || !BUDGET_BANDS.some(b => b.value === a.budgetBand)) {
    return 'budgetBand';
  }
  if (typeof a.urgency !== 'string' || !URGENCIES.some(u => u.value === a.urgency)) {
    return 'urgency';
  }

  // childLabel is optional (students never have one) but must be sane if given.
  if (a.childLabel !== null && a.childLabel !== undefined) {
    if (typeof a.childLabel !== 'string' || a.childLabel.length > 80) return 'childLabel';
  }

  return null;
}

export { QUESTIONNAIRE_LEVELS };
export type { CanonicalLevel };
