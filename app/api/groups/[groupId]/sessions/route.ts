import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { CreateGroupSessionInput } from '@/lib/types/groups';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';
import { buildOccurrenceRows } from '@/lib/classes/scheduleSessions';
import { readClassLinkState, canSeeClassLink } from '@/lib/classes/classLinkState';
import { formatSchoolDate } from '@/lib/classes/academicCalendar';

type Params = { params: Promise<{ groupId: string }> };
function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return (
    code === '42703' || code === '42P01' || code === 'PGRST200' ||
    code === 'PGRST204' || code === 'PGRST205' ||
    msg.includes('does not exist') || msg.includes('could not find a relationship')
  );
}

/** 'HH:MM' (seconds tolerated), a wall-clock time in Trinidad. */
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** A real 'YYYY-MM-DD' date — the shape alone would let 2027-02-31 through. */
function isCalendarDate(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// GET /api/groups/[groupId]/sessions — list sessions with occurrences
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const nowIso = new Date().toISOString();

    // The class link rides along with the schedule, but only for someone who
    // may join: the tutor, a superadmin acting as tutor, or an enrolled
    // student. The schedule itself stays visible to any signed-in viewer (it
    // is the class's timetable, shown before joining); the link is often the
    // tutor's permanent room and is not. Best-effort — a failure costs the
    // link, never the timetable.
    let groupMeetingLink: string | null = null;
    try {
      const linkState = await readClassLinkState(service, groupId);
      if (
        linkState.link &&
        (await canSeeClassLink(
          service,
          { userId: user.id, email: user.email },
          { groupId, tutorId: linkState.tutorId },
        ))
      ) {
        groupMeetingLink = linkState.link;
      }
    } catch (linkErr: any) {
      console.warn('[GET /api/groups/[groupId]/sessions] class link unavailable:', linkErr?.message ?? linkErr);
    }

    let sessions: any[] | null = null;
    let error: any = null;
    ({ data: sessions, error } = await service
      .from('group_sessions')
      .select(`
        id, group_id, title, recurrence_type, recurrence_days,
        start_time, duration_minutes, starts_on, ends_on, created_at,
        occurrences:group_session_occurrences(
          id, group_session_id, title, scheduled_start_at, scheduled_end_at, venue_id,
          status, cancelled_at, cancellation_note
        )
      `)
      .eq('group_id', groupId)
      .order('starts_on', { ascending: true }));

    if (error && isSchemaMismatch(error)) {
      ({ data: sessions, error } = await service
        .from('group_sessions')
        .select(`
          id, group_id, title, recurrence_type, recurrence_days,
          start_time, duration_minutes, starts_on, ends_on, created_at,
          occurrences:group_session_occurrences(
            id, group_session_id, scheduled_start_at, scheduled_end_at,
            status, cancelled_at, cancellation_note
          )
        `)
        .eq('group_id', groupId)
        .order('starts_on', { ascending: true }));
    }

    if (error && isSchemaMismatch(error)) {
      ({ data: sessions, error } = await service
        .from('group_sessions')
        .select('id, group_id, title, recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on, created_at')
        .eq('group_id', groupId)
        .order('starts_on', { ascending: true }));
    }

    if (error && isSchemaMismatch(error)) {
      return NextResponse.json({ sessions: [] });
    }

    // Return all occurrences (including cancelled) so the client can render
    // a unified chronological list with full upcoming + past history.
    const trimmed = (sessions ?? []).map((s: any) => {
      const occs: any[] = s.occurrences ?? [];
      const upcoming = occs
        .filter((o) => o.scheduled_end_at >= nowIso)
        .sort((a: any, b: any) => a.scheduled_start_at.localeCompare(b.scheduled_start_at));
      const past = occs
        .filter((o) => o.scheduled_end_at < nowIso)
        .sort((a: any, b: any) => b.scheduled_start_at.localeCompare(a.scheduled_start_at));
      return { ...s, occurrences: [...past, ...upcoming] };
    });

    if (error) throw error;

    return NextResponse.json({ sessions: trimmed, meeting_link: groupMeetingLink });
  } catch (err) {
    console.error('[GET /api/groups/[groupId]/sessions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[groupId]/sessions — create a session with occurrences (tutor only)
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    // end_date and status exist on every environment (they are in the
    // last-resort select of GET /api/groups/[groupId], which was checked
    // against both databases), so they are safe in a resolveGroupActor
    // columns string — unlike anything from migration 262.
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email, columns: 'end_date, status' });
    if (actor.notFound) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (!actor.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = (await request.json().catch(() => null)) as CreateGroupSessionInput | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: "That request couldn't be read. Please try again." }, { status: 400 });
    }

    if (!body.title?.trim() || !body.start_time || !body.starts_on) {
      return NextResponse.json({ error: 'Give the session a title, a start time and a first date.' }, { status: 400 });
    }
    if (!TIME_RE.test(String(body.start_time))) {
      return NextResponse.json({ error: "The start time isn't valid. Pick a time from the list." }, { status: 400 });
    }

    // ── Dates ────────────────────────────────────────────────────────────────
    //
    // Both are Trinidad calendar dates, 'YYYY-MM-DD'. Checked here because the
    // occurrence generator quietly produces nothing from a malformed date, and
    // an ends_on before starts_on used to create a recurring series with no
    // sessions in it at all — a row that looks like a schedule and generates
    // no class.
    //
    // A one-off session has no last date. The Sessions form still sends
    // whatever its "Last session" field held before the tutor switched to a
    // one-off, so for a one-off an unusable ends_on is dropped, not refused —
    // refusing would block a valid session over a field the tutor can't see.
    const recurrenceType = body.recurrence_type ?? 'none';
    const isRecurring = String(recurrenceType).toLowerCase() !== 'none';
    const startsOn = String(body.starts_on);
    if (!isCalendarDate(startsOn)) {
      return NextResponse.json({ error: "The first session date isn't a valid date." }, { status: 400 });
    }
    let endsOn: string | null = body.ends_on ? String(body.ends_on) : null;
    if (endsOn !== null && (!isCalendarDate(endsOn) || endsOn < startsOn)) {
      if (!isRecurring) {
        endsOn = null;
      } else if (!isCalendarDate(endsOn)) {
        return NextResponse.json({ error: "The last session date isn't a valid date." }, { status: 400 });
      } else {
        return NextResponse.json({ error: "The last session can't be before the first one." }, { status: 400 });
      }
    }

    // The class's own end date bounds its schedule. A session after it would
    // be one the class has told families it won't run: starting after it is
    // refused outright, and a recurring series is cut off at it — including one
    // sent with no last date, which would otherwise keep generating sessions
    // (up to 104 weekly, 365 daily) well past a class that ends in April.
    // clamped_to tells the caller it happened, so the UI can say so rather
    // than silently showing fewer sessions than the tutor asked for.
    const classEnd: string | null = actor.group?.end_date ? String(actor.group.end_date).slice(0, 10) : null;
    if (classEnd && startsOn > classEnd) {
      return NextResponse.json(
        { error: `This class ends on ${formatSchoolDate(classEnd)}. Pick a date on or before then.` },
        { status: 400 }
      );
    }
    let clampedTo: string | null = null;
    if (isRecurring && classEnd && (endsOn === null || endsOn > classEnd)) {
      endsOn = classEnd;
      clampedTo = classEnd;
    }

    const seriesRow = {
      group_id: groupId,
      title: body.title.trim(),
      recurrence_type: recurrenceType,
      recurrence_days: body.recurrence_days ?? [],
      start_time: body.start_time,
      duration_minutes: body.duration_minutes ?? 60,
      starts_on: startsOn,
      ends_on: endsOn,
    };

    // Built BEFORE the insert from exactly what will be stored, so a schedule
    // that produces no sessions (weekly with no day ticked, or dates that
    // contain none of the ticked days) is refused instead of saved empty.
    const occurrences = buildOccurrenceRows(seriesRow);
    if (occurrences.length === 0) {
      return NextResponse.json(
        {
          error:
            String(recurrenceType).toLowerCase() === 'weekly' && (seriesRow.recurrence_days ?? []).length === 0
              ? 'Pick at least one day of the week.'
              : "Those dates don't include any of the days you picked, so no sessions would be created.",
        },
        { status: 400 }
      );
    }

    const { data: session, error: sessionError } = await service
      .from('group_sessions')
      .insert(seriesRow)
      .select()
      .single();

    if (sessionError) throw sessionError;

    // The inserted ids go back to the caller. The Sessions tab used to invent
    // `tmp-` ids for the rows it had just created, and every action on those
    // cards — cancel, Join, attendance — 404'd until the page was reloaded.
    const { data: insertedOccurrences, error: occError } = await service
      .from('group_session_occurrences')
      .insert(occurrences.map((o) => ({ ...o, group_session_id: session.id })))
      .select('id, scheduled_start_at, scheduled_end_at, status');
    if (occError) {
      // A series with no occurrences is invisible on every calendar but still
      // counts as "has a schedule" to some readers, and a retry would add a
      // second one. Remove it so the tutor's retry starts clean.
      console.error('[POST /api/groups/[groupId]/sessions] occurrence insert failed:', occError);
      const { error: cleanupError } = await service
        .from('group_sessions')
        .delete()
        .eq('id', session.id)
        .eq('group_id', groupId);
      if (cleanupError) {
        console.error('[POST /api/groups/[groupId]/sessions] orphan series cleanup failed:', session.id, cleanupError);
      }
      return NextResponse.json(
        { error: "The sessions couldn't be saved, so nothing was added. Please try again." },
        { status: 500 }
      );
    }

    await auditAdminOverride(actor, 'session.create', { sessionId: session.id });

    // Notify approved members of new session. Not gated on status: the class
    // Settings save stores every PRIVATE class as status DRAFT, and those have
    // real members who need to hear about new sessions. A class fresh from the
    // create page has no members yet, so the scheduling pop-up sends nothing.
    // The link goes to the class page itself; /groups only redirects to the
    // dashboard, which dropped the student nowhere near this class.
    const { data: members } = await service
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('status', 'approved');

    if (members && members.length > 0) {
      try {
        await service.from('notifications').insert(
          members.map((m: any) => ({
            user_id: m.user_id,
            type: 'SESSION_REMINDER',
            title: 'Group session scheduled',
            message: `A new session "${body.title}" has been added to your group schedule.`,
            link: `/student/classes/${groupId}`,
            group_id: groupId,
          }))
        );
      } catch {
        // Notifications are non-critical. Session creation should still succeed.
      }
    }

    return NextResponse.json(
      { session: { ...session, occurrences: insertedOccurrences ?? [] }, clamped_to: clampedTo },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/sessions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Occurrence instants are built by `buildOccurrenceRows` in
// lib/classes/scheduleSessions.ts, shared with the Settings-tab schedule sync
// so that a schedule set on either screen lands on the same instants.
//
// That generator used to live here, and this copy took a client-supplied
// `timezone_offset` whose sign the callers disagreed about: the tutor class page
// sent `-getTimezoneOffset()` while the five modals sent `getTimezoneOffset()`.
// The API had no way to tell which convention it was handed, so the same 6pm
// class came out at 6pm or at 10am depending on which screen made it — Ms
// Maloney's Form 5 Geography was stored at 14:00Z, 10am AST, under a header
// advertising 6–8pm. Class times are Trinidad times and are resolved as such,
// in one place. `timezone_offset` is still accepted in the body and ignored.
