import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { cancelSessionReminders } from '@/lib/reminders/scheduleReminders';

type CancelSessionBody = {
  sessionId?: string;
  cancellationReason?: string;
  rescheduleStart?: string;
  rescheduleEnd?: string;
};

export const dynamic = 'force-dynamic';

/**
 * Cancels a tutor session through the existing RPC and cancels pending reminders.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CancelSessionBody;
    if (!body.sessionId || !body.cancellationReason) {
      return NextResponse.json(
        { error: 'sessionId and cancellationReason are required' },
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
      .select('id, tutor_id')
      .eq('id', body.sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await serverClient.rpc('tutor_cancel_session', {
      p_session_id: body.sessionId,
      p_cancellation_reason: body.cancellationReason,
      p_reschedule_start: body.rescheduleStart || null,
      p_reschedule_end: body.rescheduleEnd || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await cancelSessionReminders(body.sessionId);

    return NextResponse.json(data ?? { success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel session' },
      { status: 500 }
    );
  }
}
