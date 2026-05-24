// =====================================================
// DECLINE COUNTER-OFFER  →  CANCELLATION
// =====================================================
// POST /api/bookings/decline-counter
// Body: { bookingId: string }
//
// Per policy: rejecting a tutor's counter-offer results in a
// student-side cancellation. The booking is COUNTER_PROPOSED and a
// payment row typically does not exist yet (capture happens on
// confirm), so the refund pipeline no-ops gracefully. The event is
// logged with source='counter_offer_rejected' so admin can tell the
// two cancellation paths apart.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { refundPayment } from '@/lib/payments/refundService';
import { classifyCancelTiming, writeCancellationEvent } from '@/lib/reliability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { bookingId } = (await request.json()) as { bookingId?: string };
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

    const { data: booking } = await admin
      .from('bookings')
      .select('id, student_id, tutor_id, status, confirmed_start_at, requested_start_at')
      .eq('id', bookingId)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    if (booking.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (booking.status !== 'COUNTER_PROPOSED') {
      return NextResponse.json(
        { error: 'No counter-offer to decline' },
        { status: 400 }
      );
    }

    const scheduledStartAt: string | null =
      booking.confirmed_start_at || booking.requested_start_at || null;
    const timing = scheduledStartAt
      ? classifyCancelTiming(scheduledStartAt)
      : { hoursBefore: 0, isLate: false, isSuperLate: false };

    // Refund any payment that did exist (rare for COUNTER_PROPOSED but safe).
    const { data: payment } = await admin
      .from('payments')
      .select('id, status, amount_ttd, total_refunded_ttd')
      .eq('booking_id', booking.id)
      .in('status', ['succeeded', 'partially_refunded'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (payment) {
      const amountTtd = Number(payment.amount_ttd ?? 0);
      const alreadyRefunded = Number(payment.total_refunded_ttd ?? 0);
      const remaining = +(amountTtd - alreadyRefunded).toFixed(2);
      if (remaining > 0) {
        const result = await refundPayment({
          paymentId: payment.id,
          reason: 'student_cancelled',
          actorId: user.id,
          client: admin,
        });
        if (!result.ok) {
          return NextResponse.json(
            { error: result.message, code: result.code, details: result.details },
            { status: result.status }
          );
        }
      }
    }

    await admin
      .from('bookings')
      .update({
        status: 'CANCELLED',
        cancelled_at: new Date().toISOString(),
        cancel_reason: 'Counter-offer declined',
        last_action_by: 'student',
      })
      .eq('id', booking.id);

    await admin
      .from('sessions')
      .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
      .eq('booking_id', booking.id);

    await admin.from('booking_messages').insert({
      booking_id: booking.id,
      sender_id: user.id,
      message_type: 'system',
      body: 'Student declined the counter-offer. Booking cancelled.',
    });

    await writeCancellationEvent(admin, {
      studentId: user.id,
      tutorId: booking.tutor_id,
      bookingId: booking.id,
      scheduledStartAt,
      hoursBefore: timing.hoursBefore,
      wasLate: timing.isLate,
      feeApplied: false,
      reason: 'Counter-offer declined',
      source: 'counter_offer_rejected',
    });

    try {
      await admin.from('notifications').insert({
        user_id: booking.tutor_id,
        type: 'booking_cancelled',
        title: 'Counter-offer declined',
        message: 'The student declined your counter-offer. The booking has been cancelled.',
        link: `/tutor/bookings/${booking.id}`,
        related_booking_id: booking.id,
      });
    } catch (e) {
      console.error('decline-counter: notification insert failed', e);
    }

    return NextResponse.json({ success: true, status: 'CANCELLED' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to decline counter-offer' },
      { status: 500 }
    );
  }
}
