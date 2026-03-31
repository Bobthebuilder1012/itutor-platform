import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { rescheduleSessionReminders } from '@/lib/reminders/scheduleReminders';

type RescheduleBody = {
  sessionId?: string;
  scheduledStartAt?: string;
  durationMinutes?: number;
  reason?: string;
  tutorName?: string;
  studentName?: string;
  subjectName?: string;
};

export const dynamic = 'force-dynamic';

/**
 * Reschedules an existing session and rebuilds its reminder schedule.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RescheduleBody;
    if (!body.sessionId || !body.scheduledStartAt || !body.durationMinutes) {
      return NextResponse.json(
        { error: 'sessionId, scheduledStartAt, and durationMinutes are required' },
        { status: 400 }
      );
    }

    const serverClient = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();
    const { data: session, error: sessionError } = await admin
      .from('sessions')
      .select('id, student_id, tutor_id')
      .eq('id', body.sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    let isAuthorized = session.student_id === user.id || session.tutor_id === user.id;
    if (!isAuthorized) {
      const { data: link } = await admin
        .from('parent_child_links')
        .select('id')
        .eq('parent_id', user.id)
        .eq('child_id', session.student_id)
        .maybeSingle();

      isAuthorized = Boolean(link);
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const startAt = new Date(body.scheduledStartAt);
    const endAt = new Date(startAt.getTime() + body.durationMinutes * 60 * 1000);

    const { data: updatedSession, error: updateError } = await admin
      .from('sessions')
      .update({
        scheduled_start_at: startAt.toISOString(),
        scheduled_end_at: endAt.toISOString(),
        duration_minutes: body.durationMinutes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.sessionId)
      .select('id, student_id, tutor_id, scheduled_start_at')
      .single();

    if (updateError || !updatedSession) {
      return NextResponse.json({ error: 'Failed to reschedule session' }, { status: 500 });
    }

    const formattedDate = startAt.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const reasonText = body.reason ? ` Reason: ${body.reason}` : '';

    await admin.from('notifications').insert([
      {
        user_id: updatedSession.tutor_id,
        type: 'session_rescheduled',
        title: 'Session Rescheduled',
        message: `A parent has rescheduled ${body.studentName || 'the student'}'s ${body.subjectName || 'session'} to ${formattedDate} (${body.durationMinutes} minutes).${reasonText}`,
        link: '/tutor/dashboard',
        created_at: new Date().toISOString(),
      },
      {
        user_id: updatedSession.student_id,
        type: 'session_rescheduled',
        title: 'Session Rescheduled',
        message: `Your ${body.subjectName || 'session'} with ${body.tutorName || 'your tutor'} has been rescheduled to ${formattedDate} (${body.durationMinutes} minutes).${reasonText}`,
        link: '/student/dashboard',
        created_at: new Date().toISOString(),
      },
    ]);

    await rescheduleSessionReminders(updatedSession);

    return NextResponse.json({
      success: true,
      session: updatedSession,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reschedule session' },
      { status: 500 }
    );
  }
}
