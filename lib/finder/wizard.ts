/**
 * The wizard's vocabulary: the options each step offers, and how an answer set
 * is validated.
 *
 * Shared by the client wizard and the submit route on purpose. The route must
 * re-validate everything the client collected — a POST is a public surface even
 * behind auth, and `finder_requests` has CHECK constraints that would 500 rather
 * than reject politely if junk reached them.
 *
 * WHY SIX STEPS AND NOT THE SPEC'S FIVE. The spec makes step 1 a single subject
 * picker, on the reasoning that `subjects` already reconciles subject and level
 * into one row. It does not: `subjects.level` is corrupt (131 of 134 rows say
 * 'CSEC', including all 77 CAPE rows), so the only trustworthy columns are
 * `name` and `curriculum`. Level therefore has to be asked, and it has to be
 * asked FIRST, because `subjectsForLevel()` needs a level to produce the subject
 * options at all. This is also the order Class Match Week's questionnaire
 * already uses, so families who have seen one recognise the other.
 */

import {
  AVAILABILITY_BLOCKS,
  AVAILABILITY_BLOCK_VALUES,
  type AvailabilityBlock,
} from '@/lib/matching/availability';
import { QUESTIONNAIRE_LEVELS, type CanonicalLevel } from '@/lib/matching/levels';

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
 * Monthly budget bands in TTD. `max` is the upper bound the matcher compares
 * against; null on the top band means "no ceiling", not "$600".
 *
 * FLAGGED: these are the spec's placeholders (§14.1, "confirm against real
 * pricing"). Every class currently on staging is priced between $0 and $120/mo,
 * so in practice all four bands admit everything and this question does not
 * currently discriminate. It is still asked, because the ANSWER is what the
 * demand ledger needs in order to tell teacher acquisition what families will
 * actually pay.
 */
export const BUDGET_BANDS: ReadonlyArray<{
  value: string;
  label: string;
  max: number | null;
}> = [
  { value: 'under_200', label: 'Under $200', max: 200 },
  { value: '200_400', label: '$200 – $400', max: 400 },
  { value: '400_600', label: '$400 – $600', max: 600 },
  { value: '600_plus', label: '$600+', max: null },
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
  level: CanonicalLevel | null;
  subject: string | null;
  availabilityBlocks: AvailabilityBlock[];
  lessonType: LessonType | null;
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
    budgetBand: null,
    urgency: null,
  };
}

/** The step indices, so nothing has to hardcode a magic number. */
export const STEP = {
  CHILD: -1, // parents only, rendered before the rest
  LEVEL: 0,
  SUBJECT: 1,
  AVAILABILITY: 2,
  LESSON_TYPE: 3,
  BUDGET: 4,
  URGENCY: 5,
} as const;

export const TOTAL_STEPS = 6;

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

/**
 * Server-side validation of a submitted answer set.
 *
 * Returns the field name that failed, or null when everything is acceptable.
 * Deliberately strict about closed vocabularies: an unrecognised level is junk,
 * not a new level we should quietly record.
 */
export function validateAnswers(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return 'body';
  const a = input as Record<string, unknown>;

  if (typeof a.level !== 'string' || !LEVEL_VALUES.has(a.level)) return 'level';
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
