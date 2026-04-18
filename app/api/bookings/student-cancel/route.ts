import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { cancelSessionReminders } from '@/lib/reminders/scheduleReminders';

type CancelBody = {
  bookingId?: string;
  reason?: string;
};

export const dynamic = 'force-dynamic';

/**
 * Cancels a booking as the student and clears any pending session reminders.
 */
export async function POST(request: NextRequest) {
  try {
    const { bookingId, reason } = (await request.json()) as CancelBody;
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    if (typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'cancellation_reason_required' }, { status: 400 });
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
      .select('id, student_id, tutor_id')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await serverClient.rpc('student_cancel_booking', {
      p_booking_id: bookingId,
      p_reason: reason.trim(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: session } = await admin
      .from('sessions')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (session?.id) {
      await cancelSessionReminders(session.id);
    }

    const { data: studentProfile } = await admin
      .from('profiles')
      .select('full_name, display_name, username')
      .eq('id', user.id)
      .maybeSingle();
    const studentLabel =
      studentProfile?.display_name ||
      studentProfile?.full_name ||
      studentProfile?.username ||
      'Student';

    try {
      await admin.from('notifications').insert({
        user_id: booking.tutor_id,
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        message: `A booking from ${studentLabel} has been cancelled.`,
        link: `/tutor/bookings/${bookingId}`,
        related_booking_id: bookingId,
      });
    } catch (e) {
      console.error('student-cancel: notification insert failed', e);
    }

    return NextResponse.json(data ?? { success: true, status: 'CANCELLED' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel booking' },
      { status: 500 }
    );
  }
}
