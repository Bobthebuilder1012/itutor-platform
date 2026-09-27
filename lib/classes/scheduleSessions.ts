/**
 * The Settings tab's "Schedule" picker and the Sessions tab used to do two
 * completely different things.
 *
 *   Settings -> Schedule      wrote `groups.schedule_data`, a JSON blob read
 *                             only for DISPLAY (marketplace card, class page,
 *                             explore filters). Nothing else in the platform
 *                             knows it exists.
 *   Sessions -> Add session   wrote `group_sessions` + `group_session_occurrences`,
 *                             which is what actually drives join links, the
 *                             reminder crons, attendance, RSVPs and the
 *                             student/parent calendars.
 *
 * So a tutor who set her weekly times in Settings — the screen that says
 * "Add your recurring sessions" and shows students a schedule — got a listing
 * that advertised Mondays 4–5pm and a class that never generated a single
 * meeting link, reminder or attendance sheet. The schedule looked set. Nothing
 * downstream had a session to hang off.
 *
 * This module closes that gap: it materialises `schedule_data` into real
 * `group_sessions` series with occurrences, using the same Trinidad-time
 * resolution and the same occurrence caps as the Sessions tab, so a schedule
 * entered on either screen produces the same rows.
 *
 * It is deliberately ADD-ONLY. Occurrences carry attendance, cancellations and
 * payment state, so nothing here deletes or rewrites an existing session — a
 * day already covered by a session the tutor made by hand is left alone, and
 * removing a day from the Settings picker does not retract sessions already on
 * the calendar (the tutor cancels those from the Sessions tab, where the
 * consequences are visible).
 */

import { trinidadInstant } from '@/lib/payments/secureSpot';
import { AST_TIME_ZONE, type ScheduleEntry } from '@/lib/utils/scheduleFormat';
import type { DayOfWeek } from '@/lib/types/groups';

/** Title given to a series created from the Settings schedule. */
export const SCHEDULE_SESSION_TITLE = 'Weekly class session';

export type OccurrenceRow = {
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: 'upcoming';
};

/** The subset of a `group_sessions` row the occurrence generator needs. */
export type SessionSeries = {
  recurrence_type?: string | null;
  recurrence_days?: number[] | null;
  start_time: string;
  duration_minutes?: number | null;
  starts_on: string;
  ends_on?: string | null;
};

/**
 * Expand a session series into occurrence rows.
 *
 * A class time is a Trinidad time — every surface labels it AST — so it is
 * resolved against that zone rather than against the server's zone or a
 * browser-supplied offset. This function is the single implementation shared by
 * `POST /api/groups/[groupId]/sessions` and the schedule sync below; when they
 * were two copies, the same 4pm class could be stored at two different instants
 * depending on which screen created it.
 */
export function buildOccurrenceRows(session: SessionSeries): OccurrenceRow[] {
  const occurrences: OccurrenceRow[] = [];

  const [startHour, startMin] = String(session.start_time).split(':').map(Number);
  if (!Number.isFinite(startHour)) return occurrences;
  const durationMs = (session.duration_minutes ?? 60) * 60 * 1000;

  const [y, m, d] = String(session.starts_on).slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return occurrences;

  const endsOn = session.ends_on
    ? (() => {
        const [ey, em, ed] = String(session.ends_on).slice(0, 10).split('-').map(Number);
        return Date.UTC(ey, em - 1, ed, 23, 59, 59);
      })()
    : null;

  const localToUtc = (year: number, month: number, day: number): Date =>
    trinidadInstant(year, month, day, startHour, Number.isFinite(startMin) ? startMin : 0);

  const push = (start: Date) => {
    occurrences.push({
      scheduled_start_at: start.toISOString(),
      scheduled_end_at: new Date(start.getTime() + durationMs).toISOString(),
      status: 'upcoming',
    });
  };

  const recurrence = String(session.recurrence_type ?? 'none').toLowerCase();

  if (recurrence === 'none') {
    push(localToUtc(y, m, d));
    return occurrences;
  }

  const maxOccurrences = 400;
  const cursor = new Date(Date.UTC(y, m - 1, d));

  while (occurrences.length < maxOccurrences) {
    const curY = cursor.getUTCFullYear();
    const curM = cursor.getUTCMonth() + 1;
    const curD = cursor.getUTCDate();
    const curDay = cursor.getUTCDay();

    if (endsOn && cursor.getTime() > endsOn) break;

    if (recurrence === 'weekly') {
      const days: DayOfWeek[] = (session.recurrence_days ?? []) as DayOfWeek[];
      if (days.length === 0) break;
      if (days.includes(curDay as DayOfWeek)) push(localToUtc(curY, curM, curD));
    } else if (recurrence === 'daily') {
      push(localToUtc(curY, curM, curD));
    } else {
      break;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);

    const cap = recurrence === 'daily' ? 365 : 104;
    if (!endsOn && occurrences.length >= cap) break;
  }

  return occurrences;
}

// -- schedule_data -> session patterns ---------------------------------------

/** One `group_sessions` series waiting to be written. */
export type SchedulePattern = { time: string; durationMin: number; days: number[] };

/** Today's date in Trinidad, as `YYYY-MM-DD`. */
export function trinidadToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the `date` literal Postgres
  // wants. Going via the server's own date would roll the day over an hour
  // early or late depending on where the container runs.
  return now.toLocaleDateString('en-CA', { timeZone: AST_TIME_ZONE });
}

/**
 * `groups.schedule_data` is written as a JSON string by the settings form, but
 * older rows and other environments have handed us an array directly — accept
 * either, and drop only entries that could not be placed on a calendar.
 */
export function normaliseScheduleEntries(raw: unknown): ScheduleEntry[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const out: ScheduleEntry[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const day = Number((item as any).day);
    const timeRaw = String((item as any).time ?? '').trim();
    const durationRaw = Number((item as any).durationMin);

    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const match = /^(\d{1,2}):(\d{2})/.exec(timeRaw);
    if (!match) continue;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;

    const durationMin =
      Number.isFinite(durationRaw) && durationRaw >= 15 && durationRaw <= 600
        ? Math.trunc(durationRaw)
        : 60;

    out.push({
      day,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      durationMin,
    });
  }
  return out;
}

/**
 * Collapse entries that share a start time and duration into one weekly series,
 * so "Mon, Wed, Fri 4–5pm" becomes a single `group_sessions` row with three
 * recurrence days rather than three rows — which is what a tutor picking those
 * days in the Sessions tab would have produced.
 */
export function scheduleEntriesToPatterns(entries: ScheduleEntry[]): SchedulePattern[] {
  const byKey = new Map<string, SchedulePattern>();
  for (const e of entries) {
    const key = `${e.time}|${e.durationMin}`;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.days.includes(e.day)) existing.days.push(e.day);
    } else {
      byKey.set(key, { time: e.time, durationMin: e.durationMin, days: [e.day] });
    }
  }
  return [...byKey.values()]
    .map((p) => ({ ...p, days: p.days.sort((a, b) => a - b) }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** `HH:MM` from a Postgres `time` value, which may arrive as `16:00:00`. */
function timeKey(raw: unknown): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? '').trim());
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

/**
 * Which `day|HH:MM` slots already have a recurring series. One-off sessions
 * (`recurrence_type = 'none'`) deliberately do NOT claim a slot — a single
 * make-up lesson on a Monday shouldn't stop the weekly Monday series from being
 * created — they are de-duplicated at the occurrence level instead.
 */
function coveredSlots(sessionRows: any[]): Set<string> {
  const covered = new Set<string>();
  for (const row of sessionRows) {
    const time = timeKey(row.start_time);
    if (!time) continue;
    const recurrence = String(row.recurrence_type ?? 'none').toLowerCase();
    if (recurrence === 'daily') {
      for (let day = 0; day <= 6; day++) covered.add(`${day}|${time}`);
    } else if (recurrence === 'weekly') {
      for (const day of (row.recurrence_days ?? []) as number[]) {
        if (Number.isInteger(day) && day >= 0 && day <= 6) covered.add(`${day}|${time}`);
      }
    }
  }
  return covered;
}

function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST200' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find')
  );
}

export type ScheduleSyncResult = {
  /** False only when the sync could not run; the caller's own save still stands. */
  ok: boolean;
  /** no_schedule | no_new_days | schema | error — present when nothing was created. */
  reason?: string;
  createdSessions: number;
  createdOccurrences: number;
  /** Slots left alone because a hand-made session already covers them. */
  skipped: Array<{ day: number; time: string }>;
  /** Underlying message, for logs and the backfill script. */
  detail?: string;
};

const EMPTY: ScheduleSyncResult = {
  ok: true,
  createdSessions: 0,
  createdOccurrences: 0,
  skipped: [],
};

/**
 * Materialise a class's Settings schedule into real sessions.
 *
 * `service` must be a service-role client: `group_sessions`' RLS is written for
 * the tutor's own JWT, and this runs both from an API route (where the actor is
 * already authorised) and from a backfill script with no session at all.
 */
export async function syncScheduleSessions(input: {
  service: any;
  groupId: string;
  /** Raw `groups.schedule_data`, or already-parsed entries. */
  scheduleData: unknown;
  /** `groups.end_date`, when the class has a known last day. */
  endDate?: string | null;
  now?: Date;
}): Promise<ScheduleSyncResult> {
  const { service, groupId, scheduleData, endDate } = input;
  const now = input.now ?? new Date();

  const entries = normaliseScheduleEntries(scheduleData);
  if (entries.length === 0) return { ...EMPTY, reason: 'no_schedule' };

  // Existing series, so we neither duplicate a hand-made session nor stomp it.
  let sessionRows: any[] | null = null;
  let sessionsError: any = null;
  ({ data: sessionRows, error: sessionsError } = await service
    .from('group_sessions')
    .select('id, recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on')
    .eq('group_id', groupId));

  if (sessionsError && isSchemaMismatch(sessionsError)) {
    ({ data: sessionRows, error: sessionsError } = await service
      .from('group_sessions')
      .select('id, recurrence_type, recurrence_days, start_time')
      .eq('group_id', groupId));
  }
  if (sessionsError) {
    return {
      ok: false,
      reason: 'schema',
      createdSessions: 0,
      createdOccurrences: 0,
      skipped: [],
      detail: sessionsError.message ?? String(sessionsError),
    };
  }

  const existing = sessionRows ?? [];
  const covered = coveredSlots(existing);

  // Every instant this class already has on the calendar, so a slot held only
  // by one-off sessions doesn't sprout a second lesson at the same minute.
  const takenInstants = new Set<string>();
  if (existing.length > 0) {
    const { data: occRows } = await service
      .from('group_session_occurrences')
      .select('scheduled_start_at')
      .in(
        'group_session_id',
        existing.map((s: any) => s.id)
      );
    for (const occ of occRows ?? []) {
      takenInstants.add(new Date(occ.scheduled_start_at).toISOString());
    }
  }

  const startsOn = trinidadToday(now);
  // An end date already behind us would only generate an empty series.
  const endsOn =
    endDate && String(endDate).slice(0, 10) > startsOn ? String(endDate).slice(0, 10) : null;

  const skipped: Array<{ day: number; time: string }> = [];
  let createdSessions = 0;
  let createdOccurrences = 0;

  for (const pattern of scheduleEntriesToPatterns(entries)) {
    const newDays: number[] = [];
    for (const day of pattern.days) {
      if (covered.has(`${day}|${pattern.time}`)) skipped.push({ day, time: pattern.time });
      else newDays.push(day);
    }
    if (newDays.length === 0) continue;

    const series: SessionSeries = {
      recurrence_type: 'weekly',
      recurrence_days: newDays,
      start_time: pattern.time,
      duration_minutes: pattern.durationMin,
      starts_on: startsOn,
      ends_on: endsOn,
    };

    const rows = buildOccurrenceRows(series).filter(
      (o) =>
        new Date(o.scheduled_end_at).getTime() > now.getTime() &&
        !takenInstants.has(o.scheduled_start_at)
    );
    // A series with nothing left to teach is worse than no series: it reads as
    // a schedule whose calendar is empty.
    if (rows.length === 0) continue;

    const { data: session, error: insertError } = await service
      .from('group_sessions')
      .insert({
        group_id: groupId,
        title: SCHEDULE_SESSION_TITLE,
        recurrence_type: 'weekly',
        recurrence_days: newDays,
        start_time: pattern.time,
        duration_minutes: pattern.durationMin,
        starts_on: startsOn,
        ends_on: endsOn,
      })
      .select('id')
      .single();

    if (insertError || !session) {
      return {
        ok: false,
        reason: 'error',
        createdSessions,
        createdOccurrences,
        skipped,
        detail: insertError?.message ?? 'session insert returned no row',
      };
    }

    const { error: occError } = await service
      .from('group_session_occurrences')
      .insert(rows.map((r) => ({ ...r, group_session_id: session.id })));

    if (occError) {
      // Roll the series back rather than leave a schedule with no lessons.
      await service.from('group_sessions').delete().eq('id', session.id);
      return {
        ok: false,
        reason: 'error',
        createdSessions,
        createdOccurrences,
        skipped,
        detail: occError.message ?? String(occError),
      };
    }

    for (const r of rows) takenInstants.add(r.scheduled_start_at);
    for (const day of newDays) covered.add(`${day}|${pattern.time}`);
    createdSessions += 1;
    createdOccurrences += rows.length;
  }

  if (createdSessions === 0) return { ...EMPTY, reason: 'no_new_days', skipped };
  return { ok: true, createdSessions, createdOccurrences, skipped };
}
