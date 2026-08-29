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
const DAY_SINGULAR = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The literal suffix rendered next to a time, e.g. "5:00 PM AST". */
export const AST_LABEL = 'AST';

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
    return `${fmt(startTotalMin, false)}–${fmt(endTotalMin, true)} ${AST_LABEL}`;
  }
  return `${fmt(startTotalMin, true)}–${fmt(endTotalMin, true)} ${AST_LABEL}`;
}

/** Start time only — used when a schedule entry carries no usable duration. */
function formatStartTime(time: string): string {
  const [hh, mm] = time.split(':').map(Number);
  const h = (Number.isFinite(hh) ? hh : 0) % 24;
  const m = Number.isFinite(mm) ? mm : 0;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period} ${AST_LABEL}`;
}

export function formatScheduleEntry(e: ScheduleEntry): string {
  return `${DAY_PLURAL[e.day]} · ${formatTimeRange(e.time, e.durationMin)}`;
}

/**
 * One line per day, newline-joined. Correct for a detail page with room to
 * breathe — use `scheduleToCompact` on cards instead.
 */
export function scheduleToDisplay(entries: ScheduleEntry[]): string {
  return entries.map(formatScheduleEntry).join('\n');
}

/** "Monday and Wednesday", "Monday, Wednesday and Friday". */
function joinDayNames(days: number[]): string {
  const names = days.map((d) => DAY_SINGULAR[d]).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Collapses the common all-week / weekday-only cases so cards stay short. */
function describeDays(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'day';
  const isWeekdaysOnly = set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d));
  if (isWeekdaysOnly) return 'weekday';
  const isWeekendOnly = set.size === 2 && set.has(0) && set.has(6);
  if (isWeekendOnly) return 'weekend';
  return joinDayNames(days);
}

/**
 * Single-line recurring summary for a card:
 *   "Recurring every Monday and Wednesday · 5:00–7:00 PM AST"
 *
 * Days that share the same time and duration are grouped so the time is stated
 * once. When days genuinely run at different times we list the days and say
 * "times vary" rather than trying to fit two ranges on one line — the class
 * page carries the full per-day breakdown.
 *
 * Returns null when there is no real recurring schedule, so callers can render
 * nothing (never a "Schedule TBD" placeholder).
 */
export function scheduleToCompact(entries: ScheduleEntry[] | null | undefined): string | null {
  const valid = (entries ?? []).filter(
    (e) =>
      e &&
      typeof e.day === 'number' &&
      Number.isInteger(e.day) &&
      e.day >= 0 &&
      e.day <= 6 &&
      typeof e.time === 'string' &&
      e.time.trim() !== ''
  );
  if (valid.length === 0) return null;

  const slots = new Map<string, { time: string; durationMin: number; days: Set<number> }>();
  for (const e of valid) {
    const durationMin = Number(e.durationMin);
    const key = `${e.time}|${Number.isFinite(durationMin) ? durationMin : 0}`;
    const slot = slots.get(key) ?? {
      time: e.time,
      durationMin: Number.isFinite(durationMin) ? durationMin : 0,
      days: new Set<number>(),
    };
    slot.days.add(e.day);
    slots.set(key, slot);
  }

  if (slots.size === 1) {
    const [slot] = [...slots.values()];
    const days = [...slot.days].sort((a, b) => a - b);
    const when = slot.durationMin > 0 ? formatTimeRange(slot.time, slot.durationMin) : formatStartTime(slot.time);
    return `Recurring every ${describeDays(days)} · ${when}`;
  }

  const allDays = [...new Set(valid.map((e) => e.day))].sort((a, b) => a - b);
  return `Recurring every ${describeDays(allDays)} · times vary`;
}

export function parseScheduleData(raw: string | null | undefined): ScheduleEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── group_sessions → schedule entries ─────────────────────────────────────────

export type SessionRecurrenceRow = {
  start_time?: string | null;
  recurrence_type?: string | null;
  recurrence_days?: number[] | null;
  duration_minutes?: number | null;
};

/**
 * Turns `group_sessions` rows into schedule entries. DAILY series with no
 * explicit day list cover the whole week; anything without a placeable day is
 * skipped rather than guessed at.
 */
export function sessionRowsToEntries(rows: SessionRecurrenceRow[] | null | undefined): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (const row of rows ?? []) {
    const time = (row.start_time ?? '').trim();
    if (!time) continue;

    const recurrence = String(row.recurrence_type ?? '').toUpperCase();
    if (recurrence === 'NONE') continue;

    const durationMin = Number(row.duration_minutes);
    const listed = Array.isArray(row.recurrence_days)
      ? row.recurrence_days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [];
    const days = listed.length > 0 ? listed : recurrence === 'DAILY' ? [0, 1, 2, 3, 4, 5, 6] : [];

    for (const day of days) {
      entries.push({ day, time, durationMin: Number.isFinite(durationMin) ? durationMin : 0 });
    }
  }

  // Collapse duplicates across sessions sharing a day + time.
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.day}|${e.time}|${e.durationMin}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Dated occurrences → schedule entries ──────────────────────────────────────

export type OccurrenceLike = {
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  cancelled_at?: string | null;
  status?: string | null;
};

/**
 * Derives a weekly pattern from dated occurrences, for classes scheduled as
 * individual sessions rather than a recurrence rule (`recurrence_type` NONE or
 * no `recurrence_days`). Without this a real weekly class shows no schedule at
 * all on a card, even though its class page lists every date.
 *
 * A (weekday, time) slot must appear at least `minRepeats` times to count — one
 * date is not evidence of a recurrence, and claiming otherwise would advertise
 * a one-off class as weekly.
 */
export function occurrencesToEntries(
  occurrences: OccurrenceLike[] | null | undefined,
  minRepeats = 2
): ScheduleEntry[] {
  const counts = new Map<string, { entry: ScheduleEntry; n: number }>();

  for (const o of occurrences ?? []) {
    if (!o?.scheduled_start_at) continue;
    if (o.cancelled_at) continue;
    if (o.status && String(o.status).toLowerCase() === 'cancelled') continue;

    const start = new Date(o.scheduled_start_at);
    if (Number.isNaN(start.getTime())) continue;

    let durationMin = 0;
    if (o.scheduled_end_at) {
      const end = new Date(o.scheduled_end_at);
      if (!Number.isNaN(end.getTime())) {
        durationMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
      }
    }

    const entry: ScheduleEntry = { day: astWeekday(start), time: astTimeOfDay(start), durationMin };
    const key = `${entry.day}|${entry.time}|${entry.durationMin}`;
    const hit = counts.get(key);
    if (hit) hit.n += 1;
    else counts.set(key, { entry, n: 1 });
  }

  return [...counts.values()]
    .filter((c) => c.n >= minRepeats)
    .map((c) => c.entry)
    .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}

/**
 * Single source of truth for how a class's recurring pattern is resolved, so
 * every card and page agrees. Precedence: the tutor's manual schedule_data, then
 * a group_sessions recurrence rule, then dated occurrences.
 */
export function resolveScheduleEntries(input: {
  scheduleData?: string | null;
  sessionRows?: SessionRecurrenceRow[] | null;
  occurrences?: OccurrenceLike[] | null;
}): ScheduleEntry[] {
  const manual = parseScheduleData(input.scheduleData);
  if (manual.length > 0) return manual;

  const fromRules = sessionRowsToEntries(input.sessionRows);
  if (fromRules.length > 0) return fromRules;

  return occurrencesToEntries(input.occurrences);
}

// ── Day / time-of-day filtering ───────────────────────────────────────────────

export type TimeBand = 'morning' | 'afternoon' | 'evening';

export const TIME_BANDS: Array<{ value: TimeBand; label: string; short: string }> = [
  { value: 'morning', label: 'Morning (before 12 PM)', short: 'Morning' },
  { value: 'afternoon', label: 'Afternoon (12–5 PM)', short: 'Afternoon' },
  { value: 'evening', label: 'Evening (after 5 PM)', short: 'Evening' },
];

export const DAY_FILTER_OPTIONS: Array<{ value: number; short: string; label: string }> = [
  1, 2, 3, 4, 5, 6, 0,
].map((d) => ({ value: d, short: DAY_SINGULAR[d].slice(0, 3), label: DAY_SINGULAR[d] }));

/** Which band a stored AST start time falls into. */
export function timeBandOf(time: string): TimeBand | null {
  const [hh, mm] = String(time).split(':').map(Number);
  if (!Number.isFinite(hh)) return null;
  const minutes = hh * 60 + (Number.isFinite(mm) ? mm : 0);
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 17 * 60) return 'afternoon';
  return 'evening';
}

/**
 * Every band a start→end window touches, e.g. a tutor open 10:00–19:00 is
 * available in all three. `end` is exclusive, so 09:00–12:00 is morning only.
 *
 * Walks the window hour by hour rather than testing its two endpoints, which
 * would miss the afternoon in a 09:00–19:00 window.
 */
export function timeBandsInRange(start: string, end: string): TimeBand[] {
  const startHour = Number(String(start).split(':')[0]);
  const endHour = Number(String(end).split(':')[0]);
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return [];
  const out = new Set<TimeBand>();
  for (let h = startHour; h < Math.max(endHour, startHour + 1); h++) {
    const band = timeBandOf(`${String(h % 24).padStart(2, '0')}:00`);
    if (band) out.add(band);
  }
  return [...out];
}

/**
 * A class matches if ANY single recurring session satisfies every active
 * filter. Requiring one entry to satisfy both means "Saturday + evening" won't
 * match a class that meets Saturday morning and Tuesday evening.
 *
 * A class with no recurring schedule never matches an active day/time filter —
 * there is nothing to compare against, and including it looks like the filter
 * is broken.
 */
export function scheduleMatchesDayTime(
  entries: ScheduleEntry[] | null | undefined,
  days: number[],
  bands: TimeBand[]
): boolean {
  if (days.length === 0 && bands.length === 0) return true;
  const list = entries ?? [];
  if (list.length === 0) return false;

  return list.some((e) => {
    if (days.length > 0 && !days.includes(e.day)) return false;
    if (bands.length > 0) {
      const band = timeBandOf(e.time);
      if (!band || !bands.includes(band)) return false;
    }
    return true;
  });
}

// ── AST-anchored date/time rendering ──────────────────────────────────────────

const AST_WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Weekday (0=Sun) of a timestamp as it falls in AST, not the viewer's zone. */
export function astWeekday(d: Date): number {
  const short = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: AST_TIME_ZONE });
  return AST_WEEKDAY_INDEX[short] ?? d.getDay();
}

export function formatAstDate(d: Date, options: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString(undefined, { ...options, timeZone: AST_TIME_ZONE });
}

/** 24-hour "HH:mm" of a timestamp in AST — the shape ScheduleEntry.time expects. */
export function astTimeOfDay(d: Date): string {
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: AST_TIME_ZONE,
  });
}

/** Day-of-month in AST — for date badges that must match the AST weekday. */
export function astDayOfMonth(d: Date): string {
  return d.toLocaleDateString('en-US', { day: 'numeric', timeZone: AST_TIME_ZONE });
}

export function formatAstTimeRange(start: Date, durationMin: number): string {
  const end = new Date(start.getTime() + durationMin * 60_000);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZone: AST_TIME_ZONE };
  return `${start.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)} ${AST_LABEL}`;
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
