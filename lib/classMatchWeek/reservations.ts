/**
 * Reservation reads for the Class Match Week portal and dashboards.
 *
 * Every helper takes the service client as its first argument, for the same
 * reason as portalData.ts: the callers are route handlers serving users whose
 * RLS view of these tables is empty-or-partial, and a silent zero-row read
 * here renders as "you reserved nothing" on a dashboard. Callers pass
 * `getServiceClient()` in and enforce auth themselves.
 *
 * Times are timestamptz ISO strings throughout; clash math is plain
 * millisecond interval arithmetic — no timezone conversion belongs here.
 * Rendering in Trinidad wall-clock is the display layer's job.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassMatchReservation, ClassMatchSession } from './types';

/** A reservation joined to everything a dashboard card renders. */
export type ReservationWithSession = ClassMatchReservation & {
  session: ClassMatchSession & {
    groupName: string;
    teacherName: string;
    groupId: string;
  };
};

/**
 * Every reservation a user holds, any status, joined to its session with the
 * class name and teacher name resolved — one call per dashboard render.
 *
 * All statuses are returned deliberately: "reserved" drives the upcoming
 * list, but a cancelled session or a cancelled reservation still has to be
 * explainable on my-classes rather than silently vanishing. Callers filter.
 * Ordered by the session's start time, soonest first.
 */
export async function listUserReservations(
  admin: SupabaseClient,
  userId: string
): Promise<ReservationWithSession[]> {
  const { data: reservationData } = await admin
    .from('class_match_reservations')
    .select('*')
    .eq('user_id', userId);
  const reservations = (reservationData ?? []) as ClassMatchReservation[];
  if (reservations.length === 0) return [];

  const sessionIds = [...new Set(reservations.map((r) => r.session_id))];
  const { data: sessionData } = await admin
    .from('class_match_sessions')
    .select('*')
    .in('id', sessionIds);
  const sessions = (sessionData ?? []) as ClassMatchSession[];
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const groupIds = [...new Set(sessions.map((s) => s.group_id))];
  const tutorIds = [...new Set(sessions.map((s) => s.tutor_id))];

  const [{ data: groupData }, { data: profileData }] = await Promise.all([
    groupIds.length > 0
      ? admin.from('groups').select('id, name').in('id', groupIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    tutorIds.length > 0
      ? admin.from('profiles').select('id, display_name, full_name').in('id', tutorIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; display_name: string | null; full_name: string | null }>,
        }),
  ]);

  const groupNameById = new Map(
    ((groupData ?? []) as Array<{ id: string; name: string }>).map((g) => [g.id, g.name])
  );
  const teacherNameById = new Map(
    (
      (profileData ?? []) as Array<{
        id: string;
        display_name: string | null;
        full_name: string | null;
      }>
    ).map((p) => [p.id, p.display_name || p.full_name || 'iTutor teacher'])
  );

  return reservations
    .filter((r) => sessionById.has(r.session_id))
    .map((r) => {
      const session = sessionById.get(r.session_id)!;
      return {
        ...r,
        session: {
          ...session,
          groupName: groupNameById.get(session.group_id) ?? '',
          teacherName: teacherNameById.get(session.tutor_id) ?? 'iTutor teacher',
          groupId: session.group_id,
        },
      };
    })
    .sort(
      (a, b) =>
        new Date(a.session.scheduled_at).getTime() - new Date(b.session.scheduled_at).getTime()
    );
}

/**
 * Does a proposed interval overlap any session the user already holds a
 * 'reserved' seat on? Returns the earliest-starting clash (so the warning
 * names one session deterministically), or null.
 *
 * Overlap is half-open — [start, start + duration) — so back-to-back
 * sessions do not warn. Comparison is in epoch milliseconds; timestamptz
 * strings carry their offset, so no timezone handling is needed or wanted.
 *
 * Cancelled reservations never clash (the seat was released). Cancelled
 * sessions never clash either: a session that is not happening does not
 * occupy the family's time, and warning about it would block a real seat.
 */
export async function findClash(
  admin: SupabaseClient,
  args: {
    userId: string;
    scheduledAt: string;
    durationMinutes: number;
    excludeSessionId?: string;
  }
): Promise<null | { sessionId: string; title: string; scheduledAt: string }> {
  const start = new Date(args.scheduledAt).getTime();
  const end = start + args.durationMinutes * 60_000;
  if (Number.isNaN(start)) return null;

  const { data: reservationData } = await admin
    .from('class_match_reservations')
    .select('session_id')
    .eq('user_id', args.userId)
    .eq('status', 'reserved');
  const sessionIds = ((reservationData ?? []) as Array<{ session_id: string }>)
    .map((r) => r.session_id)
    .filter((id) => id !== args.excludeSessionId);
  if (sessionIds.length === 0) return null;

  const { data: sessionData } = await admin
    .from('class_match_sessions')
    .select('id, title, scheduled_at, duration_minutes, status')
    .in('id', sessionIds);

  const clashes = (
    (sessionData ?? []) as Array<{
      id: string;
      title: string;
      scheduled_at: string;
      duration_minutes: number;
      status: string;
    }>
  )
    .filter((s) => s.status !== 'cancelled')
    .filter((s) => {
      const otherStart = new Date(s.scheduled_at).getTime();
      const otherEnd = otherStart + s.duration_minutes * 60_000;
      return start < otherEnd && otherStart < end;
    })
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const first = clashes[0];
  return first
    ? { sessionId: first.id, title: first.title, scheduledAt: first.scheduled_at }
    : null;
}

/**
 * Live seat count for a session — 'reserved' rows only, so a cancellation
 * frees the seat. NULL max_attendees means this number never gates anything.
 */
export async function reservedCount(admin: SupabaseClient, sessionId: string): Promise<number> {
  const { count } = await admin
    .from('class_match_reservations')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'reserved');
  return count ?? 0;
}
