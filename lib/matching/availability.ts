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
 * So `timeBandOf` is the single band function. The rule it used to encode —
 * that a weekday morning is not something a family can pick, because that is
 * school hours — is expressed HERE, in the block map, where it belongs: there
 * simply is no `weekday_morning` block. That is a deliberate gap in the
 * vocabulary, not a hole in the band maths.
 *
 * WHY SIX BLOCKS AND NOT NINE. Measured against the live catalogue, the three
 * missing combinations (weekday morning, Saturday evening, Sunday evening)
 * contain zero classes. The six below cover 100% of current supply, so a family
 * can express every schedule the platform can actually offer.
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
 * The six availability blocks a family chooses from. Measured against the paid
 * class schedule, these cover 100% of current supply.
 */
export type AvailabilityBlock =
  | 'weekday_afternoon'
  | 'weekday_evening'
  | 'saturday_morning'
  | 'saturday_afternoon'
  | 'sunday_morning'
  | 'sunday_afternoon';

export const AVAILABILITY_BLOCKS: ReadonlyArray<{ value: AvailabilityBlock; label: string }> = [
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
    return []; // weekday morning is school hours, and is not offered
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
