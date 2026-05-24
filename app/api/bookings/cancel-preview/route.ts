// =====================================================
// CANCEL PREVIEW
// =====================================================
// GET /api/bookings/cancel-preview?bookingId=<uuid>
//
// Returns the refund split + counter state the cancel modal needs
// to render the policy banner before the user clicks Confirm.
// Caller is implied by auth.role; both student and tutor can hit
// this for the same booking and see their respective preview.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  classifyCancelTiming,
  getStudentCancelState,
  getTutorStrikeState,
  LATE_CANCEL_WINDOW_HOURS,
  STUDENT_LATE_CANCEL_RETENTION_PCT,
  TUTOR_SUPER_LATE_CANCEL_WINDOW_MINUTES,
} from '@/lib/reliability';
import { calculateCommission } from '@/lib/utils/commissionCalculator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const bookingId = new URL(request.url).searchParams.get('bookingId');
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
      .select('id, student_id, tutor_id, status, confirmed_start_at, requested_start_at, price_ttd')
      .eq('id', bookingId)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const role: 'student' | 'tutor' | null =
      booking.student_id === user.id ? 'student' : booking.tutor_id === user.id ? 'tutor' : null;
    if (!role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scheduledStartAt: string | null =
      booking.confirmed_start_at || booking.requested_start_at || null;
    const timing = scheduledStartAt
      ? classifyCancelTiming(scheduledStartAt)
      : { hoursBefore: 0, isLate: false, isSuperLate: false };

    const { data: payment } = await admin
      .from('payments')
      .select('id, amount_ttd, total_refunded_ttd, status')
      .eq('booking_id', booking.id)
      .in('status', ['succeeded', 'partially_refunded'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const sessionPrice = Number(payment?.amount_ttd ?? booking.price_ttd ?? 0);
    const alreadyRefunded = Number(payment?.total_refunded_ttd ?? 0);
    const remaining = +(sessionPrice - alreadyRefunded).toFixed(2);

    if (role === 'student') {
      const state = await getStudentCancelState(admin, user.id);
      const chargeFee = timing.isLate && state.late_cancel_fee_applies;
      let refundTtd = remaining;
      let retainedTtd = 0;
      if (chargeFee && remaining > 0) {
        retainedTtd = +(remaining * STUDENT_LATE_CANCEL_RETENTION_PCT).toFixed(2);
        refundTtd = +(remaining - retainedTtd).toFixed(2);
      }
      const split = retainedTtd > 0 ? calculateCommission(retainedTtd) : null;

      return NextResponse.json({
        role,
        session_price_ttd: sessionPrice,
        remaining_ttd: remaining,
        hours_before: timing.hoursBefore,
        is_late: timing.isLate,
        late_cutoff_hours: LATE_CANCEL_WINDOW_HOURS,
        cancel_state: state,
        will_charge_fee: chargeFee,
        refund_ttd: refundTtd,
        retained_ttd: retainedTtd,
        tutor_payout_on_retention_ttd: split?.payoutAmount ?? 0,
        platform_fee_on_retention_ttd: split?.platformFee ?? 0,
        policy:
          chargeFee
            ? 'Late cancellation while under reliability warning — 50% retention applies.'
            : timing.isLate
              ? `Cancelling within ${LATE_CANCEL_WINDOW_HOURS}h of start. Full refund this time. After ${state.count_30d >= 2 ? 'one more' : 'three'} cancellations within 30 days you may receive a warning, after which late cancellations incur a 50% fee.`
              : 'Standard cancellation — full refund applies.',
      });
    }

    // Tutor
    const strikeState = await getTutorStrikeState(admin, user.id);
    return NextResponse.json({
      role,
      session_price_ttd: sessionPrice,
      remaining_ttd: remaining,
      hours_before: timing.hoursBefore,
      is_super_late: timing.isSuperLate,
      super_late_cutoff_minutes: TUTOR_SUPER_LATE_CANCEL_WINDOW_MINUTES,
      strike_state: strikeState,
      refund_ttd: remaining,
      retained_ttd: 0,
      will_record_strike: true,
      will_record_system_rating: timing.isSuperLate,
      system_rating_stars: timing.isSuperLate ? 2 : null,
      policy: timing.isSuperLate
        ? `Cancelling within ${TUTOR_SUPER_LATE_CANCEL_WINDOW_MINUTES} minutes of start records an automatic 2-star system rating in addition to a strike.`
        : 'Cancelling will issue a full refund to the student and record a strike on your 90-day reliability record.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load preview' },
      { status: 500 }
    );
  }
}
