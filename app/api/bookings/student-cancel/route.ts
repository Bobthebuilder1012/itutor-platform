// =====================================================
// STUDENT CANCEL BOOKING
// =====================================================
// POST /api/bookings/student-cancel
// Body: { bookingId: string, reason: string }
//
// Policy (per UX mockups):
//   - On-time cancel (>= 12 h before start): full refund.
//   - Late cancel (< 12 h before start) BEFORE a warning has been
//     issued: still full refund, but logged as `was_late` so the
//     30-day counter ticks toward the warning threshold.
//   - Late cancel (< 12 h before start) AFTER a warning has been
//     issued: 50 % retention. The retained share is split via
//     calculateCommission so the tutor still earns commission off
//     the retained portion (40 / 10 at 20 % tier).
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { cancelSessionReminders } from '@/lib/reminders/scheduleReminders';
import { refundPayment, type RefundReason } from '@/lib/payments/refundService';
import {
  classifyCancelTiming,
  getStudentCancelState,
  writeCancellationEvent,
  STUDENT_LATE_CANCEL_RETENTION_PCT,
} from '@/lib/reliability';

type CancelBody = {
  bookingId?: string;
  reason?: string;
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
      .select('id, student_id, tutor_id, status, confirmed_start_at, confirmed_end_at, requested_start_at')
      .eq('id', bookingId)
      .maybeSingle();

    if (bookingError) {
      return NextResponse.json({ error: bookingError.message }, { status: 500 });
    }
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    if (booking.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (booking.status === 'CANCELLED') {
      return NextResponse.json({
        success: true,
        already_cancelled: true,
        status: 'CANCELLED',
      });
    }

    const scheduledStartAt: string | null =
      booking.confirmed_start_at || booking.requested_start_at || null;
    const timing = scheduledStartAt
      ? classifyCancelTiming(scheduledStartAt)
      : { hoursBefore: 0, isLate: false, isSuperLate: false };

    const cancelState = await getStudentCancelState(admin, user.id);
    const chargeFee = timing.isLate && cancelState.late_cancel_fee_applies;

    const { data: payment } = await admin
      .from('payments')
      .select('id, status, amount_ttd, total_refunded_ttd')
      .eq('booking_id', booking.id)
      .in('status', ['succeeded', 'partially_refunded'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let refundOutcome: {
      refunded_ttd: number;
      retained_ttd: number;
      payment_status: 'refunded' | 'partially_refunded';
    } | null = null;
    let feeAmountTtd = 0;

    if (payment) {
      const amountTtd = Number(payment.amount_ttd ?? 0);
      const alreadyRefunded = Number(payment.total_refunded_ttd ?? 0);
      const remaining = +(amountTtd - alreadyRefunded).toFixed(2);

      if (remaining > 0) {
        let refundAmountTtd: number;
        let retainedAmountTtd: number;
        let refundReason: RefundReason;

        if (chargeFee) {
          retainedAmountTtd = +(remaining * STUDENT_LATE_CANCEL_RETENTION_PCT).toFixed(2);
          refundAmountTtd = +(remaining - retainedAmountTtd).toFixed(2);
          refundReason = 'student_late_cancel';
          feeAmountTtd = retainedAmountTtd;
        } else {
          refundAmountTtd = remaining;
          retainedAmountTtd = 0;
          refundReason = 'student_cancelled';
        }

        const result = await refundPayment({
          paymentId: payment.id,
          reason: refundReason,
          refundAmountTtd,
          retainedAmountTtd,
          actorId: user.id,
          client: admin,
        });

        if (!result.ok) {
          return NextResponse.json(
            { error: result.message, code: result.code, details: result.details },
            { status: result.status }
          );
        }

        refundOutcome = {
          refunded_ttd: result.refundAmountTtd,
          retained_ttd: result.retainedAmountTtd,
          payment_status: result.newPaymentStatus,
        };
      }
    }

    // If no payment row existed (free booking, pre-payment, parent flow),
    // flip the booking + session ourselves. apply_refund_side_effects already
    // handles the flip when a refund fires.
    if (!payment) {
      await admin
        .from('bookings')
        .update({
          status: 'CANCELLED',
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason.trim(),
          last_action_by: 'student',
        })
        .eq('id', booking.id);

      await admin
        .from('sessions')
        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('booking_id', booking.id);
    } else {
      // Refund pipeline updates the session via the RPC; still finalise booking.
      await admin
        .from('bookings')
        .update({
          status: 'CANCELLED',
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason.trim(),
          last_action_by: 'student',
        })
        .eq('id', booking.id);
    }

    const { data: session } = await admin
      .from('sessions')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (session?.id) {
      await cancelSessionReminders(session.id);
    }

    await writeCancellationEvent(admin, {
      studentId: user.id,
      tutorId: booking.tutor_id,
      bookingId: booking.id,
      sessionId: session?.id ?? null,
      scheduledStartAt,
      hoursBefore: timing.hoursBefore,
      wasLate: timing.isLate,
      feeApplied: chargeFee,
      feeAmountTtd,
      reason: reason.trim(),
      source: 'student_cancel',
    });

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
        message: `A booking from ${studentLabel} has been cancelled${
          chargeFee ? ' (late cancellation — you keep your share of the 50% retention).' : '.'
        }`,
        link: `/tutor/bookings/${bookingId}`,
        related_booking_id: bookingId,
      });
    } catch (e) {
      console.error('student-cancel: notification insert failed', e);
    }

    return NextResponse.json({
      success: true,
      status: 'CANCELLED',
      was_late: timing.isLate,
      fee_applied: chargeFee,
      hours_before: timing.hoursBefore,
      refund: refundOutcome,
      cancel_state: {
        count_30d: cancelState.count_30d + 1,
        is_warned: cancelState.is_warned,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel booking' },
      { status: 500 }
    );
  }
}
