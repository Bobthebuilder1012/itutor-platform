import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { CreateGroupSessionInput, DayOfWeek } from '@/lib/types/groups';

type Params = { params: Promise<{ groupId: string }> };
function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return code === '42703' || code === '42P01' || code === 'PGRST205' || msg.includes('does not exist');
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
    const now = new Date().toISOString();

    let sessions: any[] | null = null;
    let error: any = null;
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

    if (error && isSchemaMismatch(error)) {
      ({ data: sessions, error } = await service
        .from('group_sessions')
        .select(`
          id, group_id, title, recurrence_type, recurrence_days,
          start_time, duration_minutes, starts_on, ends_on, created_at,
          occurrences:group_session_occurrences(
            id, group_session_id, scheduled_start_at, scheduled_end_at
          )
        `)
        .eq('group_id', groupId)
        .order('starts_on', { ascending: true }));
    }

    if (error && isSchemaMismatch(error)) {
      return NextResponse.json({ sessions: [] });
    }

    // Post-process: sort occurrences and keep only next 20 upcoming + last 2 past per session
    // (DB-level filtering on nested tables isn't supported in Supabase JS client,
    //  but we trim here before sending to the client to keep the payload small)
    const trimmed = (sessions ?? []).map((s: any) => {
      const occs: any[] = s.occurrences ?? [];
      const upcoming = occs
        .filter((o) => (o.status ? o.status === 'upcoming' : true) && o.scheduled_end_at >= now)
        .sort((a: any, b: any) => a.scheduled_start_at.localeCompare(b.scheduled_start_at))
        .slice(0, 20);
      const past = occs
        .filter((o) => (o.status ? o.status === 'upcoming' : true) && o.scheduled_end_at < now)
        .sort((a: any, b: any) => b.scheduled_start_at.localeCompare(a.scheduled_start_at))
        .slice(0, 2);
      return { ...s, occurrences: [...past, ...upcoming] };
    });

    if (error) throw error;

    return NextResponse.json({ sessions: trimmed });
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
    const { data: group } = await service
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    // Generate occurrences
    const occurrences = generateOccurrences(session);

    if (occurrences.length > 0) {
      const { error: occError } = await service
        .from('group_session_occurrences')
        .insert(occurrences.map((o) => ({ ...o, group_session_id: session.id })));
      if (occError) throw occError;
    }

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

// ---------------------------------------------------------------
// Occurrence generation helper
// ---------------------------------------------------------------
function generateOccurrences(session: any) {
  const occurrences: Array<{
    scheduled_start_at: string;
    scheduled_end_at: string;
    status: 'upcoming';
  }> = [];

  const [startHour, startMin] = session.start_time.split(':').map(Number);
  const durationMs = session.duration_minutes * 60 * 1000;
  const offsetMs = (session.timezone_offset ?? 0) * 60 * 1000;

  const [y, m, d] = session.starts_on.split('-').map(Number);
  const endsOn = session.ends_on
    ? (() => { const [ey, em, ed] = session.ends_on.split('-').map(Number); return Date.UTC(ey, em - 1, ed, 23, 59, 59); })()
    : null;

  function localToUtc(year: number, month: number, day: number): Date {
    const utcBase = Date.UTC(year, month - 1, day, startHour, startMin, 0, 0);
    return new Date(utcBase + offsetMs);
  }

  if (session.recurrence_type === 'none') {
    const start = localToUtc(y, m, d);
    occurrences.push({
      scheduled_start_at: start.toISOString(),
      scheduled_end_at: new Date(start.getTime() + durationMs).toISOString(),
      status: 'upcoming',
    });
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

    if (session.recurrence_type === 'weekly') {
      const days: DayOfWeek[] = session.recurrence_days ?? [];
      if (days.length === 0) break;

      if (days.includes(curDay as DayOfWeek)) {
        const start = localToUtc(curY, curM, curD);
        occurrences.push({
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: new Date(start.getTime() + durationMs).toISOString(),
          status: 'upcoming',
        });
      }
    } else if (session.recurrence_type === 'daily') {
      const start = localToUtc(curY, curM, curD);
      occurrences.push({
        scheduled_start_at: start.toISOString(),
        scheduled_end_at: new Date(start.getTime() + durationMs).toISOString(),
        status: 'upcoming',
      });
    } else {
      break;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);

    const cap = session.recurrence_type === 'daily' ? 365 : 104;
    if (!endsOn && occurrences.length >= cap) break;
  }

  return occurrences;
}
