/**
 * Secure your spot — dates.
 *
 * Everything here is evaluated in Trinidad local time. The servers run UTC,
 * where a 6pm class on the 30th is already the 31st, and a release date that
 * rolls over at 20:00 AST pays a tutor the evening before the month they were
 * owed. Money dates cannot be off by a day.
 *
 * There is no groups.start_date: a class starts when its schedule says it
 * starts, so the start is read from the class's sessions (group_sessions).
 * Note that `starts_on` is the row's CREATION date for recurring classes, not
 * the first lesson — the first lesson has to be projected from the recurrence,
 * which is what firstUpcomingSession does.
 */

import type { SessionPattern } from '@/lib/utils/scheduleFormat';

export const TRINIDAD_TZ = 'America/Port_of_Spain';

/** Why a class can't take preorders. Every caller renders a reason to someone. */
export type PreorderIneligibility =
  | 'no_schedule'
  | 'already_started'
  | 'starts_today'
  | 'too_far_out';

/**
 * One wording per reason, shared by every surface that has to explain it —
 * the tutor's toggle, both creation forms and the API. A disabled switch with
 * no stated reason gets reported as a missing feature.
 */
export function preorderReasonMessage(reason: PreorderIneligibility): string {
  switch (reason) {
    case 'no_schedule':
      return 'Add a schedule to open reservations.';
    case 'already_started':
      return 'This class has already started, so students join it rather than reserve a place.';
    case 'starts_today':
      return 'This class starts today — it is too late to take reservations.';
    case 'too_far_out':
      return 'This class starts too far ahead to open reservations yet.';
  }
}

/** How long a checkout holds its seat before the seat returns to the pool. */
export const SECURE_SPOT_HOLD_MINUTES = 30;

/** Preorders further out than this are refused (refund windows, card expiry). */
export const MAX_PREORDER_LEAD_DAYS = 90;

type CalendarParts = { year: number; month: number; day: number; hour: number; minute: number };

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TRINIDAD_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Wall-clock calendar parts of an instant, as seen in Trinidad. */
export function trinidadParts(instant: Date): CalendarParts {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl renders midnight as "24" in some ICU versions under hour12: false.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** Today's date in Trinidad as YYYY-MM-DD — the string the `date` columns want. */
export function trinidadToday(now: Date = new Date()): string {
  const { year, month, day } = trinidadParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The instant at which the given Trinidad wall-clock time occurs.
 *
 * Derived from the zone rather than hardcoded to UTC-4: Trinidad has no DST
 * today, but a constant would be a silent landmine if that ever changed, and
 * this costs nothing.
 */
export function trinidadInstant(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // What does that guess look like locally? The gap is the offset.
  const seen = trinidadParts(new Date(guess));
  const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  return new Date(guess + (guess - seenAsUtc));
}

function parseDateOnly(raw: string | null | undefined): { year: number; month: number; day: number } | null {
  const m = raw ? /^(\d{4})-(\d{2})-(\d{2})/.exec(raw) : null;
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

function parseTime(raw: string | null | undefined): { hour: number; minute: number } | null {
  const m = raw ? /^(\d{1,2}):(\d{2})/.exec(raw) : null;
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

/**
 * Add calendar months to a Y/M/D triple, clamping to the end of a short month:
 * 31 Jan + 1 month is 28 Feb (29 in a leap year), and 31 Aug + 1 is 30 Sep.
 *
 * Pure integer arithmetic on purpose. Doing this with a Date and a library
 * helper mixes in the *server's* timezone, and the first version of this
 * function did exactly that — on a UTC-4 machine it returned 1 March for
 * 31 January, paying a tutor a day or two late every time a month was short.
 * The only Date used here is a UTC-only probe for the length of the month.
 */
function addCalendarMonths(
  d: { year: number; month: number; day: number },
  months: number
): { year: number; month: number; day: number } {
  const zeroBased = d.month - 1 + months;
  const year = d.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12; // 0-based, non-negative
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { year, month: month + 1, day: Math.min(d.day, daysInMonth) };
}

/** Weekday (0=Sun) of a Trinidad calendar date. */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addDays(d: { year: number; month: number; day: number }, n: number) {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/**
 * The next lesson at or after `now`, projected from the class's recurrence.
 *
 * Returns null when the class has no schedule, or when every series has
 * finished — both of which mean the class cannot take preorders.
 */
export function firstUpcomingSession(
  patterns: SessionPattern[] | null | undefined,
  now: Date = new Date()
): Date | null {
  const today = trinidadParts(now);
  let earliest: Date | null = null;

  const consider = (candidate: Date | null) => {
    if (!candidate || candidate.getTime() < now.getTime()) return;
    if (!earliest || candidate.getTime() < earliest.getTime()) earliest = candidate;
  };

  for (const p of patterns ?? []) {
    const time = parseTime(p.start_time);
    if (!time) continue;

    const startsOn = parseDateOnly(p.starts_on);
    const endsOn = parseDateOnly(p.ends_on);
    const endsAt = endsOn ? trinidadInstant(endsOn.year, endsOn.month, endsOn.day, 23, 59) : null;
    if (endsAt && endsAt.getTime() < now.getTime()) continue; // series already over

    const kind = String(p.recurrence_type ?? 'none').toLowerCase();

    if (kind === 'none') {
      if (!startsOn) continue;
      consider(trinidadInstant(startsOn.year, startsOn.month, startsOn.day, time.hour, time.minute));
      continue;
    }

    // Recurring: walk forward from whichever is later, the series start or
    // today, until we hit a matching day. Two weeks is enough to catch any
    // weekly/daily pattern; monthly is handled by day-of-month below.
    const from =
      startsOn && trinidadInstant(startsOn.year, startsOn.month, startsOn.day, time.hour, time.minute).getTime() > now.getTime()
        ? startsOn
        : { year: today.year, month: today.month, day: today.day };

    if (kind === 'weekly') {
      const days = (p.recurrence_days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      const wanted = days.length ? days : startsOn ? [weekdayOf(startsOn.year, startsOn.month, startsOn.day)] : [];
      if (!wanted.length) continue;
      for (let i = 0; i < 14; i += 1) {
        const d = addDays(from, i);
        if (!wanted.includes(weekdayOf(d.year, d.month, d.day))) continue;
        const at = trinidadInstant(d.year, d.month, d.day, time.hour, time.minute);
        if (at.getTime() < now.getTime()) continue;
        if (endsAt && at.getTime() > endsAt.getTime()) break;
        consider(at);
        break;
      }
    } else if (kind === 'daily') {
      for (let i = 0; i < 2; i += 1) {
        const d = addDays(from, i);
        const at = trinidadInstant(d.year, d.month, d.day, time.hour, time.minute);
        if (at.getTime() < now.getTime()) continue;
        if (endsAt && at.getTime() > endsAt.getTime()) break;
        consider(at);
        break;
      }
    } else if (kind === 'monthly') {
      const dom = startsOn?.day ?? today.day;
      for (let i = 0; i < 2; i += 1) {
        const base = new Date(Date.UTC(today.year, today.month - 1 + i, 1));
        const y = base.getUTCFullYear();
        const mo = base.getUTCMonth() + 1;
        // Clamp: the 31st of a 30-day month is that month's last day.
        const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        const at = trinidadInstant(y, mo, Math.min(dom, lastDay), time.hour, time.minute);
        if (at.getTime() < now.getTime()) continue;
        if (endsAt && at.getTime() > endsAt.getTime()) break;
        consider(at);
        break;
      }
    }
  }

  return earliest;
}

/**
 * When the held first month becomes payable to the tutor.
 *
 * Long class  → one calendar month after the first lesson. Calendar, not 30
 *               days: 31 Jan + 1 month is 28/29 Feb.
 * Short class → the class's own end date, when the whole class finishes
 *               inside that first month. There is no second month to sell.
 *
 * Computed ONCE, at payment success, and stored. It is never recomputed from
 * groups.end_date, which is mutable — a tutor who kept extending would
 * otherwise never be paid, and one who shortened the class would be paid for
 * a month they had not taught.
 */
export function computeReleaseDate(args: { firstSession: Date; endDate?: string | null }): string {
  const { firstSession, endDate } = args;

  const s = trinidadParts(firstSession);
  const monthEnd = addCalendarMonths(s, 1);

  const end = parseDateOnly(endDate);
  const useEnd =
    end &&
    Date.UTC(end.year, end.month - 1, end.day) < Date.UTC(monthEnd.year, monthEnd.month - 1, monthEnd.day);

  const chosen = useEnd ? end! : monthEnd;
  return `${chosen.year}-${String(chosen.month).padStart(2, '0')}-${String(chosen.day).padStart(2, '0')}`;
}

/** True when the whole class finishes inside the first month — no subscribe prompt. */
export function isShortClass(args: { firstSession: Date; endDate?: string | null }): boolean {
  return computeReleaseDate(args) !== computeReleaseDate({ firstSession: args.firstSession, endDate: null });
}

/**
 * The class's very first lesson, whenever it was — used to tell "starts in
 * three weeks" apart from "has been running since May". Both have a next
 * session; only the first can be preordered.
 */
export function firstEverSession(patterns: SessionPattern[] | null | undefined): Date | null {
  let earliestStart: Date | null = null;

  for (const p of patterns ?? []) {
    const startsOn = parseDateOnly(p.starts_on);
    if (!startsOn) continue;
    const at = trinidadInstant(startsOn.year, startsOn.month, startsOn.day, 0, 0);
    if (!earliestStart || at.getTime() < earliestStart.getTime()) earliestStart = at;
  }

  if (!earliestStart) return null;
  // Project from the series start instead of from today.
  return firstUpcomingSession(patterns, earliestStart);
}

/**
 * Can this class take preorders right now?
 *
 * Never offer a payment CTA for a class with no confirmed schedule: taking
 * money for a class with no dates is indefensible in a dispute. And a class
 * already under way is a normal join, not a preorder — the student would be
 * paying a first-month hold for lessons that have already been taught.
 */
export function preorderEligibility(
  patterns: SessionPattern[] | null | undefined,
  now: Date = new Date()
): { eligible: true; firstSession: Date } | { eligible: false; reason: PreorderIneligibility } {
  const firstSession = firstUpcomingSession(patterns, now);
  if (!firstSession) return { eligible: false, reason: 'no_schedule' };

  // The class's FIRST lesson ever, not its next one. A class that began in
  // June and runs weekly always has a session a few days away, but selling a
  // "first month" that started months ago would compute release_date from a
  // date already past — wrong money, immediately.
  const firstEver = firstEverSession(patterns);
  if (firstEver && firstEver.getTime() < now.getTime()) {
    return { eligible: false, reason: 'already_started' };
  }

  // Strictly a later day than today, in Trinidad terms — not merely "later
  // than this instant". A class starting at 6pm tonight leaves no room for the
  // confirmation email to be any use, and makes the release-date edge awkward.
  if (trinidadToday(firstSession) <= trinidadToday(now)) {
    return { eligible: false, reason: 'starts_today' };
  }

  const leadDays = (firstSession.getTime() - now.getTime()) / 86_400_000;
  if (leadDays > MAX_PREORDER_LEAD_DAYS) return { eligible: false, reason: 'too_far_out' };

  return { eligible: true, firstSession };
}
