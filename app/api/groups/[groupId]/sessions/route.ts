import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { CreateGroupSessionInput } from '@/lib/types/groups';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';
import { buildOccurrenceRows } from '@/lib/classes/scheduleSessions';

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

    // Fetch the group's static meeting link (Google Meet / Zoom URL set by tutor)
    const { data: groupData } = await service
      .from('groups')
      .select('meeting_link')
      .eq('id', groupId)
      .maybeSingle();
    const groupMeetingLink: string | null = groupData?.meeting_link ?? null;

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
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (!actor.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body: CreateGroupSessionInput = await request.json();

    if (!body.title?.trim() || !body.start_time || !body.starts_on) {
      return NextResponse.json({ error: 'title, start_time, and starts_on are required' }, { status: 400 });
    }

    const { data: session, error: sessionError } = await service
      .from('group_sessions')
      .insert({
        group_id: groupId,
        title: body.title.trim(),
        recurrence_type: body.recurrence_type ?? 'none',
        recurrence_days: body.recurrence_days ?? [],
        start_time: body.start_time,
        duration_minutes: body.duration_minutes ?? 60,
        starts_on: body.starts_on,
        ends_on: body.ends_on ?? null,
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    const occurrences = buildOccurrenceRows(session);

    if (occurrences.length > 0) {
      const { error: occError } = await service
        .from('group_session_occurrences')
        .insert(occurrences.map((o) => ({ ...o, group_session_id: session.id })));
      if (occError) throw occError;
    }

    await auditAdminOverride(actor, 'session.create', { sessionId: session.id });

    // Notify approved members of new session
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
            link: `/groups`,
            group_id: groupId,
          }))
        );
      } catch {
        // Notifications are non-critical. Session creation should still succeed.
      }
    }

    return NextResponse.json({ session }, { status: 201 });
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
