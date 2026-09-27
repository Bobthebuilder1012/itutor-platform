/**
 * How many seats of each KIND a class has sold, and what is still open.
 *
 * The per-seat sibling of `classOccupancy`, which answers the same question for
 * the class as a whole. Both exist because the class total and the per-seat
 * answer are genuinely different facts once a class is hybrid:
 *
 *   ten physical seats taken, online space left
 *     → the class is NOT full
 *     → physical enrolment must be refused
 *     → online enrolment must be allowed
 *
 * A class-level check answers that wrongly in both directions — it closes online
 * because the room filled, and it reports space because the total has room when
 * the seat the student actually wants does not. `lib/utils/seatCapacity.ts` holds
 * the rule; this module is what feeds it real numbers.
 *
 * MUST BE CALLED WITH THE SERVICE CLIENT. `group_enrollments` is RLS-restricted
 * and `group_members`' policy self-references (42P17) for non-members — the same
 * constraint `classOccupancy` documents.
 *
 * ── WHY group_members COUNTS AS AN ONLINE SEAT ──────────────────────────────
 * `seat_type` lives on `group_enrollments` (migration 242). A class can also be
 * joined through `group_members` — free and approval-gated classes — and those
 * rows have no seat type at all, because every class predating 242 was online.
 * So a member row with no enrolment counts toward ONLINE. That is a statement
 * about history rather than a guess: there was no other kind of seat to hold.
 * De-duplicated by student, because someone present in both tables would
 * otherwise be counted twice and could push a class over a limit it has not
 * reached.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  allSeatAvailability,
  canEnrolInSeat,
  isClassFull,
  type SeatConfig,
  type SeatCounts,
  type SeatType,
  type SeatAvailability,
} from '@/lib/utils/seatCapacity';

/** Mirrors classOccupancy, so the two cannot disagree about who holds a seat. */
const OCCUPYING_ENROLMENT_STATUSES = ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED'];
const OCCUPYING_MEMBER_STATUSES = ['active', 'approved'];

/** The columns seatCapacity needs. Read with a tier — 242 is staging-only. */
export const SEAT_CONFIG_COLUMNS =
  'class_format, max_students_online, max_students_physical, price_online_ttd, price_physical_ttd';

/**
 * Read a group row into a SeatConfig, tolerating a database without 242.
 *
 * An absent `class_format` means every class is online, which is what those
 * environments actually contain — so the fallback is a fact, not a default.
 */
export function seatConfigFromRow(row: Record<string, unknown> | null): SeatConfig {
  const format = row?.class_format;
  return {
    class_format:
      format === 'physical' || format === 'hybrid' ? format : 'online',
    max_students_online: numOrNull(row?.max_students_online),
    max_students_physical: numOrNull(row?.max_students_physical),
    price_online_ttd: numOrNull(row?.price_online_ttd),
    price_physical_ttd: numOrNull(row?.price_physical_ttd),
  };
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Seats sold, split by kind.
 *
 * Throws on a read failure rather than reporting zeros. A silent 0 here would
 * let a capacity gate be bypassed entirely, which is worse than an error the
 * caller can turn into "try again" — the same reasoning `classOccupancy` gives.
 */
export async function seatCounts(
  admin: SupabaseClient,
  groupId: string
): Promise<SeatCounts> {
  const [{ data: enrolments, error: eErr }, { data: members, error: mErr }] =
    await Promise.all([
      admin
        .from('group_enrollments')
        .select('student_id, seat_type')
        .eq('group_id', groupId)
        .in('status', OCCUPYING_ENROLMENT_STATUSES),
      admin
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .in('status', OCCUPYING_MEMBER_STATUSES),
    ]);

  // A missing seat_type column means 242 is unapplied. Retried without it rather
  // than failing: on that database every seat is online anyway, so the answer is
  // still correct — it just cannot be split.
  let enrolmentRows = enrolments as Array<{ student_id: string; seat_type?: string | null }> | null;
  if (eErr) {
    const missingColumn =
      String(eErr.code) === '42703' ||
      String(eErr.code) === 'PGRST204' ||
      /seat_type/i.test(eErr.message ?? '');
    if (!missingColumn) {
      throw new Error(`seatCounts: enrolments read failed — ${eErr.message}`);
    }
    const retry = await admin
      .from('group_enrollments')
      .select('student_id')
      .eq('group_id', groupId)
      .in('status', OCCUPYING_ENROLMENT_STATUSES);
    if (retry.error) {
      throw new Error(`seatCounts: enrolments read failed — ${retry.error.message}`);
    }
    enrolmentRows = (retry.data ?? []) as Array<{ student_id: string }>;
  }

  if (mErr) {
    throw new Error(`seatCounts: members read failed — ${mErr.message}`);
  }

  const online = new Set<string>();
  const physical = new Set<string>();

  for (const row of enrolmentRows ?? []) {
    if (!row.student_id) continue;
    // 'physical' only when it says so. The column defaults to 'online' and is
    // null on pre-242 rows; both mean online.
    if (row.seat_type === 'physical') physical.add(row.student_id);
    else online.add(row.student_id);
  }

  for (const row of (members ?? []) as Array<{ user_id: string }>) {
    if (!row.user_id) continue;
    // Already holding a seat through an enrolment — do not count them twice.
    if (physical.has(row.user_id) || online.has(row.user_id)) continue;
    online.add(row.user_id);
  }

  return { online: online.size, physical: physical.size };
}

export interface SeatState {
  config: SeatConfig;
  counts: SeatCounts;
  availability: SeatAvailability[];
  /** True only when EVERY seat type the class offers is full. */
  full: boolean;
}

/**
 * Everything a caller needs to decide about seats, in one round trip.
 *
 * Takes the group row it has already read rather than fetching again — every
 * call site (the class GET, the checkout gate) already has one, and a second
 * read would be a chance for the two to disagree.
 */
export async function seatState(
  admin: SupabaseClient,
  groupId: string,
  groupRow: Record<string, unknown> | null
): Promise<SeatState> {
  const config = seatConfigFromRow(groupRow);
  const counts = await seatCounts(admin, groupId);
  return {
    config,
    counts,
    availability: allSeatAvailability(config, counts),
    full: isClassFull(config, counts),
  };
}

/** Can this student take this KIND of seat right now? */
export async function canTakeSeat(
  admin: SupabaseClient,
  groupId: string,
  groupRow: Record<string, unknown> | null,
  seat: SeatType
): Promise<boolean> {
  const config = seatConfigFromRow(groupRow);
  const counts = await seatCounts(admin, groupId);
  return canEnrolInSeat(config, counts, seat);
}
