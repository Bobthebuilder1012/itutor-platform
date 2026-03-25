import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createSessionForBooking } from '@/lib/services/sessionService';
import { healthCheckTutorVideoProvider } from '@/lib/services/videoProviders';

type ConfirmBody = {
  bookingId?: string;
  healthCheckOnly?: boolean;
};

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
        await createSessionForBooking(bookingId);
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
      await createSessionForBooking(bookingId);
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

