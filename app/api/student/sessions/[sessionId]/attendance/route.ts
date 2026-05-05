import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import {
  attendanceClosedReason,
  canEditAttendanceNow,
  type SelfReportedAttendanceStatus,
} from '@/lib/utils/sessionAttendance';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ sessionId: string }> };

function isStatus(v: unknown): v is SelfReportedAttendanceStatus {
  return v === 'attending' || v === 'not_attending';
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const supabase = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'student') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, student_id, scheduled_start_at, status')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: row } = await supabase
      .from('session_student_attendance')
      .select('status, updated_at')
      .eq('session_id', sessionId)
      .maybeSingle();

    const editable = canEditAttendanceNow(session.scheduled_start_at);

    return NextResponse.json({
      attendance: row ? { status: row.status, updatedAt: row.updated_at } : null,
      canEdit: editable && ['SCHEDULED', 'JOIN_OPEN'].includes(session.status),
      scheduledStartAt: session.scheduled_start_at,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const body = (await request.json()) as { status?: string };
    if (!isStatus(body.status)) {
      return NextResponse.json({ error: 'status must be attending or not_attending' }, { status: 400 });
    }

    const supabase = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'student') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, student_id, scheduled_start_at, status')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!['SCHEDULED', 'JOIN_OPEN'].includes(session.status)) {
      return NextResponse.json({ error: 'Attendance cannot be set for this session' }, { status: 400 });
    }

    if (!canEditAttendanceNow(session.scheduled_start_at)) {
      return NextResponse.json({ error: attendanceClosedReason(session.scheduled_start_at) }, { status: 400 });
    }

    const { data: upserted, error: upsertError } = await supabase
      .from('session_student_attendance')
      .upsert(
        {
          session_id: sessionId,
          student_id: user.id,
          status: body.status,
        },
        { onConflict: 'session_id' }
      )
      .select('status, updated_at')
      .single();

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    return NextResponse.json({
      attendance: { status: upserted.status, updatedAt: upserted.updated_at },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const supabase = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'student') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('student_id, scheduled_start_at, status')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!canEditAttendanceNow(session.scheduled_start_at)) {
      return NextResponse.json({ error: attendanceClosedReason(session.scheduled_start_at) }, { status: 400 });
    }

    const { error: delError } = await supabase.from('session_student_attendance').delete().eq('session_id', sessionId);

    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 400 });
    }

    return NextResponse.json({ attendance: null });
  } catch {
    return NextResponse.json({ error: 'Failed to clear attendance' }, { status: 500 });
  }
}
