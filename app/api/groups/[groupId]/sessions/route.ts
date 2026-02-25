import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { CreateGroupSessionInput, DayOfWeek } from '@/lib/types/groups';

type Params = { params: Promise<{ groupId: string }> };

// GET /api/groups/[groupId]/sessions — list sessions with occurrences
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const { data: sessions, error } = await service
      .from('group_sessions')
      .select(`
        id, group_id, title, recurrence_type, recurrence_days,
        start_time, duration_minutes, starts_on, ends_on, created_at,
        group_session_occurrences(
          id, group_session_id, scheduled_start_at, scheduled_end_at,
          status, cancelled_at, cancellation_note
        )
      `)
      .eq('group_id', groupId)
      .order('starts_on', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ sessions: sessions ?? [] });
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
      await service.from('notifications').insert(
        members.map((m: any) => ({
          user_id: m.user_id,
          type: 'group_session_added',
          title: 'New group session scheduled',
          message: `A new session "${body.title}" has been added to your group.`,
          link: `/groups`,
        }))
      ).catch(() => {});
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

  const startsOn = new Date(session.starts_on + 'T00:00:00');
  const endsOn = session.ends_on ? new Date(session.ends_on + 'T23:59:59') : null;

  if (session.recurrence_type === 'none') {
    const d = new Date(startsOn);
    d.setHours(startHour, startMin, 0, 0);
    occurrences.push({
      scheduled_start_at: d.toISOString(),
      scheduled_end_at: new Date(d.getTime() + durationMs).toISOString(),
      status: 'upcoming',
    });
    return occurrences;
  }

  const maxOccurrences = 200;
  const current = new Date(startsOn);
  current.setHours(startHour, startMin, 0, 0);

  while (occurrences.length < maxOccurrences) {
    if (endsOn && current > endsOn) break;

    if (session.recurrence_type === 'weekly') {
      const days: DayOfWeek[] = session.recurrence_days ?? [];
      if (days.length === 0) break;

      if (days.includes(current.getDay() as DayOfWeek)) {
        occurrences.push({
          scheduled_start_at: current.toISOString(),
          scheduled_end_at: new Date(current.getTime() + durationMs).toISOString(),
          status: 'upcoming',
        });
      }
      current.setDate(current.getDate() + 1);
    } else if (session.recurrence_type === 'daily') {
      occurrences.push({
        scheduled_start_at: current.toISOString(),
        scheduled_end_at: new Date(current.getTime() + durationMs).toISOString(),
        status: 'upcoming',
      });
      current.setDate(current.getDate() + 1);
    } else {
      break;
    }

    if (!endsOn && occurrences.length >= 52) break;
  }

  return occurrences;
}
