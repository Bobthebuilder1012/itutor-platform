// =====================================================
// How full a class looks to a student or a parent
// =====================================================
// "0 / 20 enrolled" was meant to create urgency and did the opposite: it told
// every early visitor they would be the first person in an empty room. The
// count is now withheld until it argues FOR joining.
//
//   more than 9 places left   say nothing about capacity
//   9 down to 1               "Only N spots left"
//   0                         full — the caller shows its waitlist state
//
// A class smaller than the threshold is scarce from the day it opens, so a
// 5-seater reads "Only 5 spots left" with nobody in it. That falls out of the
// same rule rather than needing a case of its own.
//
// TUTORS AND ADMINS ARE NOT THIS AUDIENCE. A tutor needs the true roster to
// run a class and an admin to support it, so their surfaces keep showing real
// numbers and must not use this.

/** At or below this many remaining places, students and parents see the count. */
export const SPOTS_LEFT_VISIBLE_AT = 9;

export type CapacityDisplay =
  /** Say nothing — plenty of room, or no meaningful cap. */
  | { kind: 'hidden'; remaining: number | null }
  | { kind: 'spots_left'; remaining: number; label: string }
  | { kind: 'full'; remaining: 0; label: string };

/**
 * What a student or parent should be told about a class's remaining places.
 *
 * Returns `hidden` when the capacity is unknown or unlimited: a class with no
 * cap cannot be running out, and inventing "0 spots left" from a missing
 * number would read as full.
 */
export function classCapacityDisplay(
  enrolled: number | null | undefined,
  capacity: number | null | undefined
): CapacityDisplay {
  const cap = Number(capacity ?? 0);
  if (!Number.isFinite(cap) || cap <= 0) return { kind: 'hidden', remaining: null };

  const taken = Math.max(0, Number(enrolled ?? 0) || 0);
  const remaining = Math.max(0, cap - taken);

  if (remaining === 0) return { kind: 'full', remaining: 0, label: 'Class full' };
  if (remaining > SPOTS_LEFT_VISIBLE_AT) return { kind: 'hidden', remaining };

  return {
    kind: 'spots_left',
    remaining,
    label: `Only ${remaining} spot${remaining === 1 ? '' : 's'} left`,
  };
}

/** The line to render, or null when capacity should not be mentioned at all. */
export function capacityLabel(
  enrolled: number | null | undefined,
  capacity: number | null | undefined
): string | null {
  const d = classCapacityDisplay(enrolled, capacity);
  return d.kind === 'hidden' ? null : d.label;
}
