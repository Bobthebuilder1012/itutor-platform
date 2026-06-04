// =====================================================
// TUTOR CANCEL BOOKING
// =====================================================
// POST /api/bookings/tutor-cancel
// Body: { booking_id: string, reason: string }
//
// Policy:
//   - Full refund to the student.
//   - Tutor receives no payout (apply_refund_side_effects reverts).
//   - A 90-day strike is recorded.
//   - If cancelled within 15 min of session start AND a session row
//     exists, the auto 2-star "system rating" is written, which folds
//     into the tutor's overall rating average. Appealable via
//     /api/system-ratings/[id]/appeal.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { cancelSessionReminders } from '@/lib/reminders/scheduleReminders';
import { refundPayment } from '@/lib/payments/refundService';
import {
  classifyCancelTiming,
  writeTutorStrike,
  writeSystemRating,
} from '@/lib/reliability';
import { createRequiredNotice, fmtTTD } from '@/lib/notices/createNotice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface TutorCancelBody {
  booking_id?: string;
  reason?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { booking_id, reason } = (await request.json()) as TutorCancelBody;
    if (!booking_id) {
      return NextResponse.json({ error: 'booking_id required' }, { status: 400 });
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
      .select('id, tutor_id, student_id, status, confirmed_start_at, confirmed_end_at, requested_start_at')
      .eq('id', booking_id)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    if (booking.tutor_id !== user.id) {
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

    const { data: payment } = await admin
      .from('payments')
      .select('id, status, amount_ttd, total_refunded_ttd')
      .eq('booking_id', booking.id)
      .in('status', ['succeeded', 'partially_refunded'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let refundOutcome: { refunded_ttd: number; payment_status: 'refunded' | 'partially_refunded' } | null = null;

    if (payment) {
      const amountTtd = Number(payment.amount_ttd ?? 0);
      const alreadyRefunded = Number(payment.total_refunded_ttd ?? 0);
      const remaining = +(amountTtd - alreadyRefunded).toFixed(2);

      if (remaining > 0) {
        const result = await refundPayment({
          paymentId: payment.id,
          reason: 'tutor_cancelled',
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
          payment_status: result.newPaymentStatus,
        };
      }
    }

    const { error: bookingUpdateError } = await admin
      .from('bookings')
      .update({
        status: 'CANCELLED',
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason.trim(),
        last_action_by: 'tutor',
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id);

    if (bookingUpdateError) {
      console.error('tutor-cancel: booking update failed', bookingUpdateError);
    }

    if (!payment) {
      // Free booking — RPC didn't move the session; do it ourselves.
      await admin
        .from('sessions')
        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('booking_id', booking.id);
    }

    const { data: session } = await admin
      .from('sessions')
      .select('id')
      .eq('booking_id', booking.id)
      .maybeSingle();

    if (session?.id) {
      await cancelSessionReminders(session.id);
    }

    // Strike
    await writeTutorStrike(admin, {
      tutorId: booking.tutor_id,
      reason: timing.isSuperLate ? 'tutor_super_late_cancel' : 'tutor_cancelled',
      bookingId: booking.id,
      sessionId: session?.id ?? null,
      notes: reason.trim(),
    });

    // Auto 2-star system rating (super-late only; needs a session row).
    if (timing.isSuperLate && session?.id) {
      await writeSystemRating(admin, {
        tutorId: booking.tutor_id,
        studentId: booking.student_id,
        sessionId: session.id,
        reason: 'tutor_super_late_cancel',
      });
    }

    // Audit messages on the booking thread (best effort)
    try {
      if (reason) {
        await admin.from('booking_messages').insert({
          booking_id,
          sender_id: user.id,
          message_type: 'text',
          body: reason.trim(),
        });
      }
      await admin.from('booking_messages').insert({
        booking_id,
        sender_id: user.id,
        message_type: 'system',
        body: 'Booking cancelled by tutor',
      });
    } catch (e) {
      console.error('tutor-cancel: message insert failed', e);
    }

    const { data: tutorProfile } = await admin
      .from('profiles')
      .select('full_name, display_name, username')
      .eq('id', user.id)
      .maybeSingle();
    const tutorLabel =
      tutorProfile?.display_name || tutorProfile?.full_name || tutorProfile?.username || 'Tutor';

    try {
      await admin.from('notifications').insert({
        user_id: booking.student_id,
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        message: `${tutorLabel} cancelled your booking. A full refund has been issued.`,
        link: `/student/bookings/${booking_id}`,
        related_booking_id: booking_id,
      });
    } catch (e) {
      console.error('tutor-cancel: notification insert failed', e);
    }

    // ── Required notices ──────────────────────────────────────────────────────
    try {
      const refundedTtd = refundOutcome?.refunded_ttd ?? 0;

      // Student notice: always warn that tutor cancelled and confirm refund
      await createRequiredNotice(admin, {
        user_id: booking.student_id,
        type: 'tutor_cancelled_student_refund',
        severity: 'warning',
        title: 'Your tutor cancelled this session',
        message:
          `We're sorry — your tutor had to cancel this session. ` +
          (refundedTtd > 0
            ? `A full refund of ${fmtTTD(refundedTtd)} has been issued to your original payment method.`
            : `No charge was made for this session.`),
        requires_ack: true,
        related_booking_id: booking.id,
        related_session_id: session?.id ?? null,
        related_payment_id: payment?.id ?? null,
        refund_amount_ttd: refundedTtd > 0 ? refundedTtd : null,
      });

      // Tutor notice: severity/title depends on timing
      if (timing.isSuperLate) {
        await createRequiredNotice(admin, {
          user_id: booking.tutor_id,
          type: 'session_cancelled_by_tutor',
          severity: 'danger',
          title: 'Super-late cancellation penalty',
          message:
            `You cancelled a session within 15 minutes of its start time. ` +
            `A reliability strike has been recorded on your account and an automatic ` +
            `2-star system rating has been applied. You may appeal the rating from your dashboard.`,
          requires_ack: false,
          related_booking_id: booking.id,
          related_session_id: session?.id ?? null,
        });
      } else if (timing.isLate) {
        await createRequiredNotice(admin, {
          user_id: booking.tutor_id,
          type: 'session_cancelled_by_tutor',
          severity: 'warning',
          title: 'Late cancellation — strike applied',
          message:
            `You cancelled a session within 12 hours of its start time. ` +
            `A reliability strike has been recorded on your account. ` +
            `Repeated late cancellations may affect your standing on the platform.`,
          requires_ack: false,
          related_booking_id: booking.id,
          related_session_id: session?.id ?? null,
        });
      } else {
        await createRequiredNotice(admin, {
          user_id: booking.tutor_id,
          type: 'session_cancelled_by_tutor',
          severity: 'info',
          title: 'You cancelled a session',
          message:
            `Your session has been cancelled and the student has been notified. ` +
            `A reliability strike has been recorded as per platform policy.`,
          requires_ack: false,
          related_booking_id: booking.id,
          related_session_id: session?.id ?? null,
        });
      }
    } catch (e) {
      console.error('tutor-cancel: required notice insert failed', e);
    }
    // ── End required notices ──────────────────────────────────────────────────

    return NextResponse.json({
      success: true,
      status: 'CANCELLED',
      was_super_late: timing.isSuperLate,
      hours_before: timing.hoursBefore,
      refund: refundOutcome,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel booking' },
      { status: 500 }
    );
  }
}
