import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createSessionForBooking } from '@/lib/services/sessionService';
import { healthCheckTutorVideoProvider } from '@/lib/services/videoProviders';
import { sendPushToUsers } from '@/lib/services/serverPushService';

const SESSION_REMINDER_TYPE = 'session_reminder_10_min';
const SESSION_REMINDER_TITLE = 'Session Reminder';
const SESSION_REMINDER_BODY = 'Remember, you have a scheduled iTutor session starting in 10 minutes.';

type ConfirmBody = {
  bookingId?: string;
  healthCheckOnly?: boolean;
};

export const dynamic = 'force-dynamic';

/**
 * If a session starts within 10 minutes, send push reminders immediately.
 * Uses notifications_log for idempotency — safe to call even if the Edge Function
 * cron already fired (it will detect the existing log entry and skip).
 */
async function maybeSendImmediateReminder(
  session: { id: string; student_id: string; tutor_id: string; scheduled_start_at: string },
  supabase: ReturnType<typeof getServiceClient>
): Promise<void> {
  const msUntilStart = new Date(session.scheduled_start_at).getTime() - Date.now();
  if (msUntilStart <= 0 || msUntilStart > 10 * 60 * 1000) return;

  // Determine which users haven't been notified yet
  const candidateUserIds = [session.student_id, session.tutor_id];
  const { data: existingLogs } = await supabase
    .from('notifications_log')
    .select('user_id')
    .in('user_id', candidateUserIds)
    .eq('session_id', session.id)
    .eq('type', SESSION_REMINDER_TYPE);

  const alreadyNotified = new Set((existingLogs ?? []).map((l: { user_id: string }) => l.user_id));
  const userIdsToNotify = candidateUserIds.filter(id => !alreadyNotified.has(id));
  if (userIdsToNotify.length === 0) return;

  await supabase.from('notifications_log').insert(
    userIdsToNotify.map(userId => ({
      user_id: userId,
      session_id: session.id,
      type: SESSION_REMINDER_TYPE,
    }))
  );

  sendPushToUsers(
    userIdsToNotify,
    SESSION_REMINDER_TITLE,
    SESSION_REMINDER_BODY,
    { session_id: session.id, type: SESSION_REMINDER_TYPE }
  ).catch(() => {});
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ConfirmBody;
    const bookingId = body.bookingId;
    const healthCheckOnly = Boolean(body.healthCheckOnly);

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
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
    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .select('id, tutor_id, status')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (booking.status === 'CONFIRMED') {
      console.log('✅ [booking-confirm] Booking already confirmed; ensuring session', { bookingId });
      let sessionCreationWarning: string | null = null;
      try {
        const existingSession = await createSessionForBooking(bookingId);
        await maybeSendImmediateReminder(existingSession, admin);
      } catch (sessionError: any) {
        sessionCreationWarning = sessionError?.message || 'Failed to create session';
        console.error('⚠️ [booking-confirm] Existing confirmed booking session sync failed', {
          bookingId,
          tutorId: user.id,
          sessionCreationWarning,
        });
      }
      return NextResponse.json({
        success: true,
        alreadyConfirmed: true,
        status: 'CONFIRMED',
        sessionCreationWarning,
      });
    }

    if (!['PENDING', 'COUNTER_PROPOSED'].includes(booking.status)) {
      return NextResponse.json(
        {
          error: `Booking is no longer confirmable (current status: ${booking.status})`,
          code: 'BOOKING_NO_LONGER_PENDING',
        },
        { status: 409 }
      );
    }

    const health = await healthCheckTutorVideoProvider(user.id);
    console.log('🩺 [booking-confirm] Health check result', {
      bookingId,
      tutorId: user.id,
      ok: health.ok,
      provider: health.provider,
      refreshed: health.refreshed,
      healthCheckOnly,
    });

    if (!health.ok) {
      return NextResponse.json(
        {
          error: 'Video provider reconnect required before confirming this booking.',
          code: 'VIDEO_PROVIDER_RECONNECT_REQUIRED',
          health,
        },
        { status: 412 }
      );
    }

    if (healthCheckOnly) {
      return NextResponse.json({
        success: true,
        health,
        requiresExplicitConfirmation: true,
      });
    }

    const { error: confirmError } = await serverClient.rpc('tutor_confirm_booking', {
      p_booking_id: bookingId,
    });

    if (confirmError) {
      console.error('❌ [booking-confirm] RPC confirm failed', {
        bookingId,
        tutorId: user.id,
        error: confirmError,
      });
      return NextResponse.json(
        {
          error: confirmError.message || 'Failed to confirm booking',
          code: 'BOOKING_CONFIRM_FAILED',
        },
        { status: 409 }
      );
    }

    let sessionCreationWarning: string | null = null;
    try {
      const newSession = await createSessionForBooking(bookingId);
      await maybeSendImmediateReminder(newSession, admin);
    } catch (sessionError: any) {
      sessionCreationWarning = sessionError?.message || 'Failed to create session';
      console.error('⚠️ [booking-confirm] Booking confirmed but session creation failed', {
        bookingId,
        tutorId: user.id,
        sessionCreationWarning,
      });
    }

    return NextResponse.json({
      success: true,
      status: 'CONFIRMED',
      health,
      sessionCreationWarning,
    });
  } catch (error: any) {
    console.error('❌ [booking-confirm] Unexpected error', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

