/**
 * The wizard's vocabulary: the options each step offers, and how an answer set
 * is validated.
 *
 * Shared by the client wizard and the submit route on purpose. The route must
 * re-validate everything the client collected — a POST is a public surface even
 * behind auth, and `finder_requests` has CHECK constraints that would 500 rather
 * than reject politely if junk reached them.
 *
 * THE LEVEL IS NOT ASKED. It is already collected during account creation
 * (`profiles.form_level`, set by SignupCard's student profile step) and asking a
 * second time reads as though the first answer was thrown away. The submit route
 * reads it off the profile instead — which also means the wizard cannot disagree
 * with the account about what year the learner is in.
 *
 * The consequence for step order: subject options come from
 * `subjectsForLevel(level)`, so the profile's level is what seeds the very first
 * question rather than an answer given a moment earlier.
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
  CHILD: -1, // parents only, rendered before the rest
  SUBJECT: 0,
  AVAILABILITY: 1,
  LESSON_TYPE: 2,
  DELIVERY: 3,
  BUDGET: 4,
  URGENCY: 5,
} as const;

export const TOTAL_STEPS = 6;

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
 * `level` is NOT validated here — it is not part of the submission. The route
 * reads it from the profile.
 */
export function validateAnswers(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return 'body';
  const a = input as Record<string, unknown>;

  if (typeof a.subject !== 'string' || a.subject.trim().length === 0) return 'subject';

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

export type { CanonicalLevel };
