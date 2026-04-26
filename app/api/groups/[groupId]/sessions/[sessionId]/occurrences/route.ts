import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; sessionId: string }> };

export const dynamic = 'force-dynamic';

// POST /api/groups/[groupId]/sessions/[sessionId]/occurrences
// Add a single occurrence to an existing session series (no recurrence stream change).
// Body: {
//   scheduled_date: 'YYYY-MM-DD',
//   start_time?: 'HH:MM',         // defaults to series start_time
//   duration_minutes?: number,    // defaults to series duration_minutes
//   title?: string,               // per-occurrence title override
//   timezone_offset?: number      // browser offset in minutes (Date.getTimezoneOffset())
// }
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { groupId, sessionId } = await params;
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

    const { data: session, error: sessionError } = await service
      .from('group_sessions')
      .select('id, group_id, start_time, duration_minutes')
      .eq('id', sessionId)
      .eq('group_id', groupId)
      .single();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const scheduledDate: string | undefined = body?.scheduled_date;
    if (!scheduledDate || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return NextResponse.json({ error: 'scheduled_date (YYYY-MM-DD) is required' }, { status: 400 });
    }

    const startTime: string = body?.start_time || session.start_time || '09:00';
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) {
      return NextResponse.json({ error: 'Invalid start_time' }, { status: 400 });
    }
    const duration: number =
      Number.isFinite(body?.duration_minutes) && body.duration_minutes > 0
        ? Math.floor(body.duration_minutes)
        : session.duration_minutes || 60;

    const tzOffsetMinutes: number =
      typeof body?.timezone_offset === 'number' ? body.timezone_offset : 0;
    const [hh, mm] = startTime.split(':').map((s: string) => parseInt(s, 10));
    const [yyyy, mo, dd] = scheduledDate.split('-').map((s) => parseInt(s, 10));
    const localUtcMs = Date.UTC(yyyy, mo - 1, dd, hh, mm, 0);
    const startMs = localUtcMs + tzOffsetMinutes * 60 * 1000;
    const endMs = startMs + duration * 60 * 1000;
    const scheduled_start_at = new Date(startMs).toISOString();
    const scheduled_end_at = new Date(endMs).toISOString();

    const rawTitle = typeof body?.title === 'string' ? body.title.trim() : '';
    const title = rawTitle.length > 0 ? rawTitle : null;

    const baseRow = {
      group_session_id: sessionId,
      scheduled_start_at,
      scheduled_end_at,
      status: 'upcoming',
    };

    let { data: occurrence, error: occError } = await service
      .from('group_session_occurrences')
      .insert({ ...baseRow, title })
      .select()
      .single();

    if (occError && isSchemaMismatch(occError)) {
      ({ data: occurrence, error: occError } = await service
        .from('group_session_occurrences')
        .insert(baseRow)
        .select()
        .single());
    }

    if (occError) throw occError;

    return NextResponse.json({ occurrence }, { status: 201 });
  } catch (err) {
    console.error('[POST occurrence]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}
