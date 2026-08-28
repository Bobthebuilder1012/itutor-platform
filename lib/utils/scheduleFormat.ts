export type ScheduleEntry = { day: number; time: string; durationMin: number };

/**
 * A row of `group_sessions` — the recurrence the tutor actually entered when
 * they added a session to the class. This is the schedule students should see:
 * `groups.schedule_data` is only filled in when a tutor edits the class's
 * "schedule" field by hand, which almost nobody does.
 */
export type SessionPattern = {
  recurrence_type?: string | null;
  recurrence_days?: number[] | null;
  start_time?: string | null;
  duration_minutes?: number | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

/**
 * Class times are authored, stored and displayed in Atlantic Standard Time
 * (UTC-4, no DST) — the platform's home timezone. Every surface that shows or
 * resolves a class time must agree on this; rendering some in the viewer's
 * local zone and others in AST is how a student ends up at the wrong hour.
 * The `AST` suffix is written literally in the formatters below.
 */
export const AST_TIME_ZONE = 'America/Port_of_Spain';

const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatTimeRange(time: string, durationMin: number): string {
  const [hh, mm] = time.split(':').map(Number);
  const startTotalMin = hh * 60 + mm;
  const endTotalMin = startTotalMin + durationMin;

  const fmt = (totalMin: number, showPeriod: boolean) => {
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const mStr = m.toString().padStart(2, '0');
    return showPeriod ? `${h12}:${mStr} ${period}` : `${h12}:${mStr}`;
  };

  const startPeriod = hh >= 12 ? 'PM' : 'AM';
  const endH = Math.floor(endTotalMin / 60) % 24;
  const endPeriod = endH >= 12 ? 'PM' : 'AM';

  if (startPeriod === endPeriod) {
    return `${fmt(startTotalMin, false)}–${fmt(endTotalMin, true)} AST`;
  }
  return `${fmt(startTotalMin, true)}–${fmt(endTotalMin, true)} AST`;
}

export function formatScheduleEntry(e: ScheduleEntry): string {
  return `${DAY_PLURAL[e.day]} · ${formatTimeRange(e.time, e.durationMin)}`;
}

export function scheduleToDisplay(entries: ScheduleEntry[]): string {
  return entries.map(formatScheduleEntry).join('\n');
}

export function parseScheduleData(raw: string | null | undefined): ScheduleEntry[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

/* ─── occurrence titles ───────────────────────────────── */

// Auto-generated series names look like "Session — Wed, Sep 9" (see the tutor
// class page). They are minted once, from the FIRST date, and then belong to
// the whole recurring series.
const AUTO_SESSION_TITLE = /^session\s*[—–-]/i;

/**
 * The heading for a single occurrence of a class.
 *
 * A recurring series carries one title, so listing occurrences with it repeats
 * the first date against every row: a weekly class showed "Session — Wed,
 * Sep 9" beside Sep 16, Sep 23 and Sep 30. Auto-generated titles are therefore
 * re-derived from the occurrence's own date, in the same format they were
 * minted in, so nothing looks relabelled.
 *
 * A title the tutor actually chose ("CSEC Algebra") is left alone — repeating
 * that across dates is correct.
 */
export function occurrenceTitle(
  seriesTitle: string | null | undefined,
  start: Date | string | null | undefined,
  fallback = 'Class session'
): string {
  const title = (seriesTitle ?? '').trim();
  if (title && !AUTO_SESSION_TITLE.test(title)) return title;

  const at = start instanceof Date ? start : start ? new Date(start) : null;
  if (!at || Number.isNaN(at.getTime())) return title || fallback;

  return `Session — ${at.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })}`;
}

/* ─── group_sessions → human schedule ─────────────────── */

function parseDateOnly(raw: string | null | undefined): Date | null {
  const m = raw ? /^(\d{4})-(\d{2})-(\d{2})/.exec(raw) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// `time` columns come back as "16:00:00"; formatTimeRange wants "16:00".
function normalizeTime(raw: string | null | undefined): string | null {
  const m = raw ? /^(\d{1,2}):(\d{2})/.exec(raw) : null;
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : null;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function cleanDays(days: number[] | null | undefined): number[] {
  return Array.from(new Set((days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b);
}

/** "Mondays" · "Mondays & Wednesdays" · "Mon, Wed & Fri" (abbreviated past two). */
export function formatDayList(days: number[]): string {
  const sorted = cleanDays(days);
  if (!sorted.length) return '';
  const names = sorted.map((d) => (sorted.length > 2 ? DAY_SHORT[d]! : DAY_PLURAL[d]!));
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]!}`;
}

type PreparedPattern = {
  kind: 'weekly' | 'daily' | 'monthly' | 'once';
  days: number[];
  time: string;
  durationMin: number;
  startsAt: Date | null;
};

// Drops patterns that can't be described (no start time) and series that have
// already finished — a class whose only session ended last month has no
// schedule to advertise, so callers can fall back to "to be announced".
function preparePatterns(patterns: SessionPattern[] | null | undefined, now: Date): PreparedPattern[] {
  const out: PreparedPattern[] = [];

  for (const p of patterns ?? []) {
    const time = normalizeTime(p.start_time);
    if (!time) continue;

    const durationMin = p.duration_minutes && p.duration_minutes > 0 ? p.duration_minutes : 60;
    const startsOn = parseDateOnly(p.starts_on);
    const endsOn = parseDateOnly(p.ends_on);
    if (endsOn) {
      const seriesEnd = new Date(endsOn);
      seriesEnd.setHours(23, 59, 59, 999);
      if (seriesEnd < now) continue;
    }

    const [hh, mm] = time.split(':').map(Number);
    const startsAt = startsOn ? new Date(startsOn) : null;
    startsAt?.setHours(hh!, mm!, 0, 0);

    const kind = String(p.recurrence_type ?? 'none').toLowerCase();
    if (kind === 'weekly') {
      const days = cleanDays(p.recurrence_days);
      const resolved = days.length ? days : startsOn ? [startsOn.getDay()] : [];
      if (!resolved.length) continue;
      out.push({ kind: 'weekly', days: resolved, time, durationMin, startsAt });
    } else if (kind === 'daily') {
      out.push({ kind: 'daily', days: [0, 1, 2, 3, 4, 5, 6], time, durationMin, startsAt });
    } else if (kind === 'monthly') {
      out.push({ kind: 'monthly', days: startsOn ? [startsOn.getDay()] : [], time, durationMin, startsAt });
    } else {
      // One-off session: only worth showing while it's still ahead.
      if (!startsAt) continue;
      if (startsAt.getTime() + durationMin * 60_000 < now.getTime()) continue;
      out.push({ kind: 'once', days: [startsAt.getDay()], time, durationMin, startsAt });
    }
  }

  return out;
}

/**
 * Recurring schedule lines for a class, e.g.
 *   "Mon, Wed & Fri · 4:00–5:00 PM AST"
 *   "Every day · 9:00–10:00 AM AST"
 *   "Sat, Jun 13 · 4:00–5:00 PM AST"     (one-off)
 * Weekly rows that share a start time and duration are merged into one line.
 */
export function sessionPatternsToLines(patterns: SessionPattern[] | null | undefined, opts?: { now?: Date }): string[] {
  const now = opts?.now ?? new Date();
  const prepared = preparePatterns(patterns, now);

  const weekly = new Map<string, { days: number[]; time: string; durationMin: number }>();
  const repeating: string[] = [];
  const dated: { at: number; line: string }[] = [];

  for (const p of prepared) {
    if (p.kind === 'weekly') {
      const key = `${p.time}|${p.durationMin}`;
      const bucket = weekly.get(key) ?? { days: [], time: p.time, durationMin: p.durationMin };
      bucket.days.push(...p.days);
      weekly.set(key, bucket);
    } else if (p.kind === 'daily') {
      repeating.push(`Every day · ${formatTimeRange(p.time, p.durationMin)}`);
    } else if (p.kind === 'monthly') {
      const dom = p.startsAt?.getDate();
      repeating.push(
        dom
          ? `Monthly on the ${ordinal(dom)} · ${formatTimeRange(p.time, p.durationMin)}`
          : `Monthly · ${formatTimeRange(p.time, p.durationMin)}`
      );
    } else if (p.startsAt) {
      const datePart = p.startsAt.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        ...(p.startsAt.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
      });
      dated.push({ at: p.startsAt.getTime(), line: `${datePart} · ${formatTimeRange(p.time, p.durationMin)}` });
    }
  }

  return [
    ...Array.from(weekly.values()).map((b) => `${formatDayList(b.days)} · ${formatTimeRange(b.time, b.durationMin)}`),
    ...repeating,
    ...dated.sort((a, b) => a.at - b.at).map((d) => d.line),
  ];
}

/** Same as {@link sessionPatternsToLines}, newline-joined, or null when empty. */
export function sessionPatternsToDisplay(patterns: SessionPattern[] | null | undefined, opts?: { now?: Date }): string | null {
  const lines = sessionPatternsToLines(patterns, opts);
  return lines.length ? lines.join('\n') : null;
}

/** Weekdays (0=Sun) a class meets on, for weekday chips. */
export function sessionPatternWeekdays(patterns: SessionPattern[] | null | undefined, opts?: { now?: Date }): number[] {
  const now = opts?.now ?? new Date();
  return cleanDays(preparePatterns(patterns, now).flatMap((p) => p.days));
}

/** Duration of the first describable session, for "50 min per session" labels. */
export function sessionPatternsDuration(patterns: SessionPattern[] | null | undefined, opts?: { now?: Date }): number | null {
  const now = opts?.now ?? new Date();
  return preparePatterns(patterns, now)[0]?.durationMin ?? null;
}
