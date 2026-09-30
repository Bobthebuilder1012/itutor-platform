/**
 * When a tutor's own class link is due to be rotated.
 *
 * A tutor's own Zoom / Teams / Meet room is usually permanent. A student who
 * leaves the class — stops paying, is removed — still has the link and can keep
 * walking in. The only fix is a new room, so the class page asks tutors to
 * change the link at the end of every month.
 *
 * The reminder window opens on the third-to-last day of each month (Trinidad
 * time). A link set before the most recent window opened is due; the reminder
 * then stays up until the tutor saves a new link, however long that takes.
 * Setting a link inside the window counts for that month.
 *
 * Pure and client-safe. groups.meeting_link_set_at (migration 263) is the
 * timestamp read; it is NULL for a link saved before 263, which is treated as
 * due — its age is unknown, and a rotation reminder erring early is harmless.
 */

import { trinidadToday } from '@/lib/payments/secureSpot';

/** How many days before the month ends the reminder window opens. */
export const ROTATION_WINDOW_DAYS = 3;

function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The first day of the most recent reminder window on or before `todayYmd`. */
export function rotationWindowStart(todayYmd: string): string {
  const [y, m, d] = todayYmd.split('-').map(Number);
  const openDay = lastDayOfMonth(y, m) - (ROTATION_WINDOW_DAYS - 1);
  if (d >= openDay) return ymd(y, m, openDay);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return ymd(py, pm, lastDayOfMonth(py, pm) - (ROTATION_WINDOW_DAYS - 1));
}

/** Whether today is inside a month-end window (the last few days of the month). */
export function inRotationWindow(todayYmd: string): boolean {
  return rotationWindowStart(todayYmd).slice(0, 7) === todayYmd.slice(0, 7);
}

/**
 * Whether a custom link last set at `setAt` (an ISO timestamp, or null when
 * unknown) should be rotated now. Only meaningful for a class in custom mode
 * with a link saved.
 */
export function isRotationDue(setAt: string | null | undefined, now: Date = new Date()): boolean {
  const today = trinidadToday(now);
  if (!setAt) return true;
  const t = new Date(setAt);
  if (Number.isNaN(t.getTime())) return true;
  return trinidadToday(t) < rotationWindowStart(today);
}
