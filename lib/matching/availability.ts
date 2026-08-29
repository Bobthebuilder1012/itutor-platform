/**
 * Availability blocks: the vocabulary a family answers in, and how a class's
 * weekly schedule is tested against it.
 *
 * WHY THIS IS BUILT ON `lib/utils/scheduleFormat.ts` AND NOT ON A SECOND COPY.
 * The repo briefly had two time-band functions with different boundaries:
 * `timeBandOf()` in scheduleFormat, which every card and class page already
 * renders through, and `slotBlocks()` in lib/classMatchWeek/schedule.ts, which
 * added a 05:00 morning floor and returned `[]` for weekday mornings and
 * weekend evenings. Two band functions means a class can be filtered into one
 * band and displayed in another, which reads as a broken filter and is a trust
 * failure at a family's first contact with the platform.
 *
 * So `timeBandOf` is the single band function, and which day/band pairs a family
 * may pick is expressed in the block map below rather than smuggled into the
 * band maths.
 *
 * WHY SEVEN BLOCKS AND NOT NINE. Saturday and Sunday evenings are absent: the
 * live catalogue contains none, and nobody has asked for them. Weekday mornings
 * ARE present — see the note on the type below for why that exclusion was
 * reversed.
 *
 * ONE BEHAVIOURAL DIFFERENCE, ACCEPTED KNOWINGLY. `slotBlocks` treated
 * anything before 05:00 as no band at all, so a 03:00 Saturday class matched
 * nothing. `timeBandOf` has no such floor, so that class now matches
 * "Saturday mornings". No class in the catalogue starts before 05:00, and the
 * alternative — keeping a second set of boundaries so one pathological row
 * sorts differently — costs more than it saves.
 *
 * Times are AST wall-clock strings throughout — never zoned timestamps.
 * `groups.timezone` is NOT NULL, reads 'UTC' on every row, and is wrong; the
 * occurrence generator ignores it and hard-codes Trinidad. Never read it.
 */

import { timeBandOf, type ScheduleEntry } from '@/lib/utils/scheduleFormat';

/**
 * The seven availability blocks a family chooses from.
 *
 * WEEKDAY MORNINGS ARE LISTED, and that is a deliberate reversal. This module
 * originally omitted the block on the grounds that a weekday morning is school
 * hours — true for most learners, but not all: home-schoolers, the private and
 * denominational schools that run a shifted timetable, students on a
 * half-day/shift system, CAPE students with free periods, and anyone resitting.
 * Excluding the block did not just hide the option, it made those families
 * unmatchable and their demand unrecordable, which is the more expensive error.
 *
 * The other two combinations with no current supply — Saturday and Sunday
 * evenings — stay out. They were measured as empty AND nobody has asked for
 * them; weekday mornings were asked for.
 */
export type AvailabilityBlock =
  | 'weekday_morning'
  | 'weekday_afternoon'
  | 'weekday_evening'
  | 'saturday_morning'
  | 'saturday_afternoon'
  | 'sunday_morning'
  | 'sunday_afternoon';

export const AVAILABILITY_BLOCKS: ReadonlyArray<{ value: AvailabilityBlock; label: string }> = [
  { value: 'weekday_morning', label: 'Weekday mornings' },
  { value: 'weekday_afternoon', label: 'Weekday afternoons' },
  { value: 'weekday_evening', label: 'Weekday evenings' },
  { value: 'saturday_morning', label: 'Saturday mornings' },
  { value: 'saturday_afternoon', label: 'Saturday afternoons' },
  { value: 'sunday_morning', label: 'Sunday mornings' },
  { value: 'sunday_afternoon', label: 'Sunday afternoons' },
];

export const AVAILABILITY_BLOCK_VALUES: ReadonlySet<string> = new Set(
  AVAILABILITY_BLOCKS.map((b) => b.value)
);

/** Narrow unvalidated input — a `text[]` column, or a public request body. */
export function isAvailabilityBlock(value: unknown): value is AvailabilityBlock {
  return typeof value === 'string' && AVAILABILITY_BLOCK_VALUES.has(value);
}

/**
 * Which block a single weekly meeting falls into.
 *
 * `day` is Postgres/JS day-of-week, 0 = Sunday. Returns `[]` for a meeting no
 * block covers — a weekday morning, a Saturday 10 PM — which then simply never
 * matches a family's selection. It is an array rather than a single value so a
 * seventh block spanning two cells could be added without changing callers.
 */
export function availabilityBlocksOf(entry: ScheduleEntry): AvailabilityBlock[] {
  const band = timeBandOf(entry.time);
  if (!band) return [];

  const day = entry.day;
  if (day >= 1 && day <= 5) {
    if (band === 'afternoon') return ['weekday_afternoon'];
    if (band === 'evening') return ['weekday_evening'];
    if (band === 'morning') return ['weekday_morning'];
    return [];
  }
  if (day === 6) {
    if (band === 'morning') return ['saturday_morning'];
    if (band === 'afternoon') return ['saturday_afternoon'];
    return []; // Saturday evening: no supply, so no block
  }
  if (day === 0) {
    if (band === 'morning') return ['sunday_morning'];
    if (band === 'afternoon') return ['sunday_afternoon'];
    return []; // Sunday evening: no supply, so no block
  }
  return [];
}

/**
 * Does ANY weekly meeting of the class fall inside the blocks the family chose?
 *
 * Asked of the ongoing paid class's schedule — the learner has to be able to
 * attend the class itself, not just one sample of it.
 *
 * An empty selection is "no constraint" and matches any class that has a usable
 * schedule at all, so a caller that skips the availability question still gets
 * results rather than a silently empty page. A class with NO schedule never
 * matches a non-empty selection: there is nothing to compare, and including it
 * would look like the filter was ignored.
 */
export function entriesMatchAvailability(
  entries: ScheduleEntry[] | null | undefined,
  selected: AvailabilityBlock[]
): boolean {
  const list = entries ?? [];
  if (selected.length === 0) return list.length > 0;
  return list.some((entry) => availabilityBlocksOf(entry).some((b) => selected.includes(b)));
}

/** The blocks a whole class covers, deduped — for a card's "fits" line. */
export function classAvailabilityBlocks(
  entries: ScheduleEntry[] | null | undefined
): AvailabilityBlock[] {
  const out = new Set<AvailabilityBlock>();
  for (const entry of entries ?? []) {
    for (const block of availabilityBlocksOf(entry)) out.add(block);
  }
  return AVAILABILITY_BLOCKS.map((b) => b.value).filter((v) => out.has(v));
}
