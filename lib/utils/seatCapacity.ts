/**
 * Per-seat-type capacity.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: a class is not full until every
 * seat type it offers is full. A hybrid class with ten physical seats taken and
 * online space left is not "at capacity" — physical enrolment is blocked, online
 * stays open, and the class-level banner must not fire.
 *
 * The pre-existing test is `enrolledCount >= group.capacity`
 * (app/tutor/classes/[id]/page.tsx), which is a class-level total. On a hybrid
 * class that is wrong in both directions: it closes online enrolment because
 * the physical room filled, and it reports space because the total has room
 * when the seat the student actually wants does not.
 *
 * WHY max_students IS NOT THE INPUT HERE. Migration 241 keeps it as the sum of
 * the two caps via a trigger, so it stays correct for everything that reads it
 * today — but a sum cannot answer "can this student buy a physical seat", which
 * is the only question that matters at enrolment. Read the two caps.
 *
 * NULL MEANS UNLIMITED, 0 MEANS NONE. They are different answers and the
 * distinction is load-bearing: `groups.max_students` is NOT NULL and cannot
 * express unlimited, which is exactly why Class Match Week gave its sessions a
 * nullable `max_attendees` of their own (migration 232). A seat type absent
 * from the format returns `unavailable`, which is not the same as `full` — a
 * student should be told "this class has no physical seats", never "the room is
 * full".
 */

import { classCapacityDisplay, type CapacityDisplay } from './classCapacity';

export type ClassFormat = 'online' | 'physical' | 'hybrid';
export type SeatType = 'online' | 'physical';

/** Which seat types a format actually offers. */
export function seatTypesFor(format: ClassFormat): SeatType[] {
  if (format === 'online') return ['online'];
  if (format === 'physical') return ['physical'];
  return ['online', 'physical'];
}

export function formatOffersSeat(format: ClassFormat, seat: SeatType): boolean {
  return seatTypesFor(format).includes(seat);
}

/** The seat-shaped fields this module reads off a class. */
export type SeatConfig = {
  class_format: ClassFormat;
  max_students_online: number | null;
  max_students_physical: number | null;
  price_online_ttd: number | null;
  price_physical_ttd: number | null;
};

/** Enrolled counts, split by what each student bought. */
export type SeatCounts = { online: number; physical: number };

export type SeatAvailability = {
  seat: SeatType;
  /** The class does not offer this seat type at all. */
  unavailable: boolean;
  /** null = unlimited. Never 0-for-unknown. */
  capacity: number | null;
  enrolled: number;
  /** null when unlimited. */
  remaining: number | null;
  full: boolean;
  priceTtd: number | null;
};

function capFor(config: SeatConfig, seat: SeatType): number | null {
  const raw = seat === 'online' ? config.max_students_online : config.max_students_physical;
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
}

function priceFor(config: SeatConfig, seat: SeatType): number | null {
  const raw = seat === 'online' ? config.price_online_ttd : config.price_physical_ttd;
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function seatAvailability(
  config: SeatConfig,
  counts: SeatCounts,
  seat: SeatType
): SeatAvailability {
  const offered = formatOffersSeat(config.class_format, seat);
  const capacity = capFor(config, seat);
  const enrolled = Math.max(0, Number(counts[seat] ?? 0) || 0);

  if (!offered) {
    return {
      seat,
      unavailable: true,
      capacity: 0,
      enrolled,
      remaining: 0,
      full: false, // NOT full — the class simply does not sell this seat
      priceTtd: null,
    };
  }

  // Unlimited: no cap set for a seat the format does offer.
  if (capacity === null) {
    return { seat, unavailable: false, capacity: null, enrolled, remaining: null, full: false, priceTtd: priceFor(config, seat) };
  }

  const remaining = Math.max(0, capacity - enrolled);
  return {
    seat,
    unavailable: false,
    capacity,
    enrolled,
    remaining,
    full: remaining === 0,
    priceTtd: priceFor(config, seat),
  };
}

/** Availability for every seat type the class offers, in display order. */
export function allSeatAvailability(config: SeatConfig, counts: SeatCounts): SeatAvailability[] {
  return seatTypesFor(config.class_format).map((seat) => seatAvailability(config, counts, seat));
}

/**
 * Can a student buy this specific seat right now?
 *
 * Separate from `isClassFull` on purpose: the join flow asks this, and the
 * answer for physical must not depend on how full online is.
 */
export function canEnrolInSeat(config: SeatConfig, counts: SeatCounts, seat: SeatType): boolean {
  const a = seatAvailability(config, counts, seat);
  return !a.unavailable && !a.full;
}

/**
 * Is the class full? True only when EVERY seat type it offers is full.
 *
 * A format whose seats are all uncapped is never full. This is the test that
 * gates the class-level "At capacity" banner and the invite buttons — not a
 * comparison against a total.
 */
export function isClassFull(config: SeatConfig, counts: SeatCounts): boolean {
  const seats = allSeatAvailability(config, counts).filter((a) => !a.unavailable);
  if (seats.length === 0) return false;
  return seats.every((a) => a.full);
}

/** Which seat types are still open. Empty means the class is full. */
export function openSeatTypes(config: SeatConfig, counts: SeatCounts): SeatType[] {
  return allSeatAvailability(config, counts)
    .filter((a) => !a.unavailable && !a.full)
    .map((a) => a.seat);
}

/**
 * The cheapest price a student could pay to get in, across seat types that are
 * actually open. Null when nothing is open or no price is set.
 *
 * Used for the "from TT$X/mo" line: quoting a price for a sold-out seat is how
 * a card advertises something nobody can buy.
 */
export function lowestOpenPriceTtd(config: SeatConfig, counts: SeatCounts): number | null {
  const prices = allSeatAvailability(config, counts)
    .filter((a) => !a.unavailable && !a.full && a.priceTtd !== null && a.priceTtd > 0)
    .map((a) => a.priceTtd as number);
  return prices.length ? Math.min(...prices) : null;
}

/**
 * Student- and parent-facing capacity copy, per seat type.
 *
 * Delegates to `classCapacityDisplay` so the withhold-above-9 rule lives in one
 * place — a physical room with three seats left should read exactly like an
 * online class with three left. Unlimited and unavailable both render nothing.
 */
export function seatCapacityDisplay(
  config: SeatConfig,
  counts: SeatCounts,
  seat: SeatType
): CapacityDisplay {
  const a = seatAvailability(config, counts, seat);
  if (a.unavailable || a.capacity === null) return { kind: 'hidden', remaining: a.remaining };
  return classCapacityDisplay(a.enrolled, a.capacity);
}

/**
 * The lowest total capacity the settings screen may offer, per seat type.
 *
 * The existing floor is `Math.max(2, enrolledCount)` against the class total,
 * which blocks valid edits on a hybrid class: a tutor with 8 online and 2
 * physical students cannot reduce physical seats to 2, because the floor is
 * computed from all 10. The floor belongs to the seat being edited.
 *
 * The `2` is a product minimum for a group class, not a schema constraint —
 * `groups_max_students_check` is only `CHECK (max_students > 0)`. It is
 * therefore applied to the class TOTAL, not to each seat, so a hybrid class may
 * legitimately have 1 physical seat and 1 online seat.
 */
export function seatCapacityFloor(enrolledInSeat: number): number {
  return Math.max(0, Math.trunc(Number(enrolledInSeat) || 0));
}

/** Minimum total seats for a group class. Product rule, not a DB constraint. */
export const GROUP_TOTAL_SEAT_MINIMUM = 2;
