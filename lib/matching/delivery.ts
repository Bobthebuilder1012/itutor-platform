/**
 * Online, in person, or either.
 *
 * WHY THIS DIMENSION EXISTS AT ALL. Migration 242 added `groups.class_format`
 * ('online' | 'physical' | 'hybrid') and a venue with a street address. Before
 * it, every class on the platform was online and the question could not be
 * asked wrongly because there was only one answer. Now it can: a family in
 * Tobago can be recommended a Saturday-morning class in San Fernando that fits
 * their subject, their year and their budget perfectly and is two hours and a
 * ferry away. Availability and budget are checked to the point of pedantry; a
 * mismatch this large going unchecked would be the most visible failure the
 * Finder has.
 *
 * THE TRUTH TABLE IS NOT REPEATED HERE. `formatOffersSeat` in
 * lib/utils/seatCapacity.ts already answers "does this format offer this kind
 * of seat", and it is the same question. Two copies would agree today and
 * disagree the first time a fourth format is added — and the way they would
 * disagree is a hybrid class disappearing from one surface.
 *
 * A NULL FORMAT IS ONLINE. The column has DEFAULT 'online' and is nullable for
 * rows written before the migration, which is every class currently on
 * production. Treating null as "unknown, exclude" would empty the catalogue;
 * treating it as online is what those classes actually are.
 */

import { formatOffersSeat, type ClassFormat } from '@/lib/utils/seatCapacity';

/** What the family asked for. */
export type DeliveryPref = 'online' | 'in_person' | 'either';

export const DELIVERY_PREFS: ReadonlyArray<{
  value: DeliveryPref;
  label: string;
  detail: string;
}> = [
  {
    value: 'online',
    label: 'Online',
    detail: 'Join from home on a laptop or phone. Nothing to travel to.',
  },
  {
    value: 'in_person',
    label: 'In person',
    detail: 'Meet the teacher and the class at a venue.',
  },
  {
    value: 'either',
    label: 'Either is fine',
    detail: 'Show me both and I will decide.',
  },
];

export const DELIVERY_PREF_VALUES: ReadonlySet<string> = new Set(
  DELIVERY_PREFS.map(p => p.value)
);

export function normaliseClassFormat(raw: string | null | undefined): ClassFormat {
  if (raw === 'physical' || raw === 'hybrid') return raw;
  return 'online';
}

/**
 * Does this class deliver the way the family asked?
 *
 * A hybrid class satisfies BOTH 'online' and 'in_person' — which is the point of
 * hybrid, and why this is a seat question rather than a format equality check.
 */
export function classServesDelivery(
  format: string | null | undefined,
  pref: DeliveryPref | null
): boolean {
  if (!pref || pref === 'either') return true;
  const normalised = normaliseClassFormat(format);
  return formatOffersSeat(normalised, pref === 'online' ? 'online' : 'physical');
}

/** Card copy. Named from the SEAT, not the format, because that is what the
 *  family is choosing between — "Hybrid" means nothing to a parent. */
export function deliveryLabel(format: string | null | undefined): string {
  const normalised = normaliseClassFormat(format);
  if (normalised === 'physical') return 'In person';
  if (normalised === 'hybrid') return 'Online or in person';
  return 'Online';
}

export type { ClassFormat };
