/**
 * Weekly schedule handling for Class Match Week.
 *
 * The real class schedule lives in `group_sessions` — every schedule-shaped
 * column on `groups` (recurrence_rule, session_frequency, availability_window,
 * session_length_minutes) is null across the whole eligible catalogue, and
 * `groups.timezone` reads 'UTC' on every row while classes are Trinidad
 * wall-clock. So this module works entirely from `group_sessions` rows and
 * treats times as AST wall-clock strings, never as zoned timestamps.
 *
 * Three production facts shape the implementation:
 *
 * 1. **Duplicates are real.** `group_sessions` contains exact duplicate rows
 *    differing only in `ends_on`. Rendering per row gives a parent two
 *    identical slots, so expansion dedupes by (day, start time).
 *
 * 2. **`start_time` is `time NOT NULL`.** Testing it for null implies a guard
 *    that does not exist. Schedulability is decided by `recurrence_days` being
 *    non-empty and the series being unexpired — nothing else.
 *
 * 3. **The availability bands are half-open**, matching `timeBandOf()` in
 *    lib/utils/scheduleFormat.ts: morning 05:00 ≤ t < 12:00, afternoon
 *    12:00 ≤ t < 17:00, evening 17:00 ≤ t < 22:00. Three live classes start at
 *    exactly 17:00 — closed bands would put them in two bands or neither.
 */

import type { AvailabilityBlock } from './types';

export type { AvailabilityBlock } from './types';

/** One weekly meeting of a class. `day` is Postgres DOW: 0=Sunday..6=Saturday. */
export type WeeklySlot = {
  day: number;
  /** AST wall-clock, 'HH:MM'. */
  startTime: string;
  durationMinutes: number;
};

const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/** 'HH:MM:SS' or 'HH:MM' → 'HH:MM', or null when unparseable. */
function normaliseTime(raw: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(raw ?? '');
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : null;
}

/** Minutes since midnight, or null when the time cannot be read. */
function minutesOf(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Expand `group_sessions` rows into deduplicated weekly slots.
 *
 * A row is usable iff its `recurrence_days` is non-empty AND its series has not
 * expired (`ends_on` null or today-or-later). One eligible series expired on
 * 2026-07-03 and is the only Form 1 class in the catalogue — without the expiry
 * filter it would match on day-of-week while offering nothing to attend.
 *
 * Duration defaults to 60 when null: that is the database default, the API
 * fallback and by far the most common real value (60 minutes on 21 of 36
 * series; 30 on none).
 */
export function classWeeklySlots(
  rows: Array<{
    recurrence_days: number[] | null;
    start_time: string;
    duration_minutes: number | null;
    ends_on: string | null;
  }>
): WeeklySlot[] {
  const today = new Date().toISOString().slice(0, 10);
  const slots: WeeklySlot[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!Array.isArray(row.recurrence_days) || row.recurrence_days.length === 0) continue;
    if (row.ends_on && row.ends_on < today) continue;

    const startTime = normaliseTime(row.start_time);
    if (!startTime) continue;

    const durationMinutes =
      typeof row.duration_minutes === 'number' && row.duration_minutes > 0
        ? row.duration_minutes
        : 60;

    for (const day of row.recurrence_days) {
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      // Dedupe by (day, startTime) — production holds literal duplicate rows
      // differing only in ends_on.
      const key = `${day}|${startTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      slots.push({ day, startTime, durationMinutes });
    }
  }

  return slots.sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime));
}

/**
 * The availability block(s) a slot's start time falls into.
 *
 * The questionnaire offers six blocks, not nine: there is no weekday-morning
 * (school hours) and no weekend-evening option, because measured against the
 * live catalogue those blocks contain zero classes. A slot outside every block
 * — a weekday morning, a Saturday 10 PM, a 22:30 start — returns `[]` rather
 * than throwing, and simply never matches an availability selection.
 */
export function slotBlocks(slot: WeeklySlot): AvailabilityBlock[] {
  const minutes = minutesOf(slot.startTime);
  if (minutes === null) return [];

  // Half-open bands, matching timeBandOf(): a 17:00 start is evening, not both.
  const band =
    minutes >= 5 * 60 && minutes < 12 * 60
      ? 'morning'
      : minutes >= 12 * 60 && minutes < 17 * 60
        ? 'afternoon'
        : minutes >= 17 * 60 && minutes < 22 * 60
          ? 'evening'
          : null;
  if (!band) return [];

  if (slot.day >= 1 && slot.day <= 5) {
    if (band === 'afternoon') return ['weekday_afternoon'];
    if (band === 'evening') return ['weekday_evening'];
    return []; // weekday morning: school hours, not a questionnaire option
  }
  if (slot.day === 6) {
    if (band === 'morning') return ['saturday_morning'];
    if (band === 'afternoon') return ['saturday_afternoon'];
    return [];
  }
  if (slot.day === 0) {
    if (band === 'morning') return ['sunday_morning'];
    if (band === 'afternoon') return ['sunday_afternoon'];
    return [];
  }
  return [];
}

/**
 * Does any weekly meeting of the class fall inside the blocks the family
 * selected? This is asked of the PAID class schedule, not the taster session —
 * the child must be able to attend the ongoing class after the taster.
 *
 * An empty selection is treated as "no constraint" and matches any class with
 * a usable schedule, so a caller that skips the availability question still
 * gets results rather than a silent empty page.
 */
export function classMatchesAvailability(
  slots: WeeklySlot[],
  selected: AvailabilityBlock[]
): boolean {
  if (selected.length === 0) return slots.length > 0;
  return slots.some((slot) => slotBlocks(slot).some((block) => selected.includes(block)));
}

/** '16:00' + 12h → { label without period, period }. */
function twelveHour(minutes: number): { label: string; period: 'AM' | 'PM' } {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return { label: `${h12}:${m.toString().padStart(2, '0')}`, period };
}

/**
 * "Mondays · 4:00–5:00 PM" — the slot line on a campaign card.
 *
 * En dash between the times, plural day name, 12-hour clock, minutes always
 * shown so 4:00 and 4:30 read the same shape. The period is stated once when
 * start and end share it, twice when the range crosses noon.
 */
export function formatSlot(slot: WeeklySlot): string {
  const day = DAY_PLURAL[slot.day] ?? DAY_PLURAL[0]!;
  const startMinutes = minutesOf(slot.startTime) ?? 0;
  const endMinutes = startMinutes + slot.durationMinutes;

  const start = twelveHour(startMinutes);
  const end = twelveHour(endMinutes);

  const range =
    start.period === end.period
      ? `${start.label}–${end.label} ${end.period}`
      : `${start.label} ${start.period}–${end.label} ${end.period}`;

  return `${day} · ${range}`;
}
