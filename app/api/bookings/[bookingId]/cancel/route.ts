// =====================================================
// CANCEL BOOKING — LEGACY / ADMIN FALLBACK
// =====================================================
// POST /api/bookings/:bookingId/cancel
// Body: {
//   canceller: 'student' | 'tutor',
//   late?: boolean,        // student-side only; triggers 50/50 retention
//   reason?: string        // optional free-form note (logged on payment)
// }
//
// DEPRECATED for user-facing flows. The UI now hits
// /api/bookings/student-cancel and /api/bookings/tutor-cancel which
// both wire through lib/reliability + lib/payments/refundService and
// also write cancellation_events / strikes / system ratings.
//
// This route stays as a thin admin fallback that performs the refund
// only (no reliability side effects). Do not call from new product
// surfaces.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { refundPayment, type RefundReason } from '@/lib/payments/refundService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CancellerSide = 'student' | 'tutor';

interface CancelBody {
  canceller?: CancellerSide;
  late?: boolean;
  reason?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const body = (await request.json().catch(() => ({}))) as CancelBody;

  if (body.canceller !== 'student' && body.canceller !== 'tutor') {
    return NextResponse.json(
      { error: "canceller must be 'student' or 'tutor'" },
      { status: 400 }
    );
  }
  const canceller = body.canceller;
  const isLate = canceller === 'student' && body.late === true;

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
    .select('id, student_id, tutor_id, status, payment_required, payment_status')
    .eq('id', params.bookingId)
    .maybeSingle();

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Authorisation: only the side claiming to cancel can cancel.
  const ownerId = canceller === 'student' ? booking.student_id : booking.tutor_id;
  if (ownerId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (booking.status === 'CANCELLED') {
    return NextResponse.json({
      ok: true,
      already_cancelled: true,
      booking_id: booking.id,
    });
  }

  // Locate the active succeeded / partially refunded payment, if any.
  const { data: payment } = await admin
    .from('payments')
    .select('id, status, amount_ttd, total_refunded_ttd')
    .eq('booking_id', booking.id)
    .in('status', ['succeeded', 'partially_refunded'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let refundResult: Awaited<ReturnType<typeof refundPayment>> | null = null;

  if (payment) {
    const amountTtd = Number(payment.amount_ttd ?? 0);
    const alreadyRefunded = Number(payment.total_refunded_ttd ?? 0);
    const remaining = +(amountTtd - alreadyRefunded).toFixed(2);

    if (remaining > 0) {
      // Decide refund shape per policy.
      let refundAmountTtd: number;
      let retainedAmountTtd: number;
      let reason: RefundReason;

      if (canceller === 'tutor') {
        refundAmountTtd = remaining;
        retainedAmountTtd = 0;
        reason = 'tutor_cancelled';
      } else if (isLate) {
        // 50/50 split of what's left to refund.
        refundAmountTtd = +(remaining / 2).toFixed(2);
        retainedAmountTtd = +(remaining - refundAmountTtd).toFixed(2);
        reason = 'student_late_cancel';
      } else {
        refundAmountTtd = remaining;
        retainedAmountTtd = 0;
        reason = 'student_cancelled';
      }

      refundResult = await refundPayment({
        paymentId: payment.id,
        reason,
        refundAmountTtd,
        retainedAmountTtd,
        actorId: user.id,
        client: admin,
      });

      if (!refundResult.ok) {
        return NextResponse.json(
          {
            error: refundResult.message,
            code: refundResult.code,
            details: refundResult.details,
          },
          { status: refundResult.status }
        );
      }
    }
  }

  // Flip booking state. Always do this even if no payment existed
  // (free booking) or remaining was zero (already fully refunded).
  const { error: bookingUpdateError } = await admin
    .from('bookings')
    .update({
      status: 'CANCELLED',
      cancelled_at: new Date().toISOString(),
      cancel_reason: body.reason?.trim() || null,
      last_action_by: canceller,
    })
    .eq('id', booking.id);

  if (bookingUpdateError) {
    console.error('[bookings/cancel] booking update failed:', bookingUpdateError);
    // Refund already happened — surface the inconsistency rather than 500.
    return NextResponse.json(
      {
        ok: true,
        warning: 'Refund processed but booking row update failed',
        details: bookingUpdateError.message,
        refund: refundResult,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    booking_id: booking.id,
    canceller,
    late: isLate,
    refund: refundResult
      ? {
          status: refundResult.ok ? refundResult.newPaymentStatus : null,
          ledger_action: refundResult.ok ? refundResult.ledgerAction : null,
          refund_amount_ttd: refundResult.ok ? refundResult.refundAmountTtd : 0,
          retained_amount_ttd: refundResult.ok ? refundResult.retainedAmountTtd : 0,
          total_refunded_ttd: refundResult.ok ? refundResult.totalRefundedTtd : 0,
          warning: refundResult.ok ? refundResult.warning : undefined,
        }
      : null,
  });
}
