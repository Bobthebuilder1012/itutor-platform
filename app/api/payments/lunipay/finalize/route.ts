// =====================================================
// LUNIPAY FINALIZE
// =====================================================
// GET /api/payments/lunipay/finalize?session_id=cs_xxx
//
// Fallback the success page calls if the webhook never
// fires (or fires late). Pulls the session directly from
// LuniPay, verifies it's paid, and runs the SAME booking-
// materialisation path the webhook uses.
//
// Idempotent: if the booking already exists, returns it.
// Auth: caller must be the student listed in metadata.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getLunipayClient, centsToTtd } from '@/lib/payments/lunipayClient';
import { createSessionForBooking } from '@/lib/services/sessionService';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type AdminClient = SupabaseClient<any, 'public', 'public', any, any>;

function getAdminClient(): AdminClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json(
      { error: 'session_id is required' },
      { status: 400 }
    );
  }

  // Auth: require an authenticated user. We use the user-context client
  // here because the metadata has the expected student id and we want
  // to ensure the caller IS that student.
  const userClient = await getServerClient();
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdminClient();

  // Idempotency: if a payment already exists for this session, the
  // webhook (or a prior finalize call) already ran. Just return the
  // current state.
  const { data: existing } = await admin
    .from('payments')
    .select('id, booking_id, status')
    .eq('lunipay_checkout_session_id', sessionId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      status: 'already_processed',
      paymentId: existing.id,
      bookingId: existing.booking_id,
      paymentStatus: existing.status,
    });
  }

  // Fetch the LuniPay session — this is the source of truth for whether
  // the student actually paid.
  let session: any;
  try {
    const lunipay = getLunipayClient();
    session = await lunipay.checkout.sessions.retrieve(sessionId);
  } catch (err: any) {
    console.error('[lunipay/finalize] sessions.retrieve failed:', err);
    return NextResponse.json(
      { error: 'Could not retrieve checkout session', details: err?.message },
      { status: 502 }
    );
  }

  const paid =
    session?.status === 'COMPLETE' || session?.payment_status === 'paid';
  if (!paid) {
    return NextResponse.json(
      { status: 'not_paid', sessionStatus: session?.status, paymentStatus: session?.payment_status },
      { status: 409 }
    );
  }

  const md = session.metadata || {};
  if (md.kind !== 'create_booking') {
    return NextResponse.json(
      { error: 'Session is not a create_booking checkout' },
      { status: 400 }
    );
  }

  if (md.student_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Same logic as webhook's materialiseBookingFromCheckout.
  const studentId = md.student_id;
  const tutorId = md.tutor_id;
  const subjectId = md.subject_id;
  const requestedStartAt = md.requested_start_at;
  const requestedEndAt = md.requested_end_at;

  if (!studentId || !tutorId || !subjectId || !requestedStartAt || !requestedEndAt) {
    console.error('[lunipay/finalize] metadata incomplete:', md);
    return NextResponse.json(
      { error: 'Checkout metadata incomplete' },
      { status: 500 }
    );
  }

  const sessionTypeId = md.session_type_id || null;
  const durationMinutes = parseInt(md.duration_minutes ?? '60', 10);
  const priceTtd = Number(md.price_ttd ?? '0');
  const platformFeePct = parseInt(md.platform_fee_pct ?? '0', 10);
  const platformFeeTtd = Number(md.platform_fee_ttd ?? '0');
  const tutorPayoutTtd = Number(md.tutor_payout_ttd ?? '0');
  const studentNotes = md.student_notes || null;

  // Slot conflict re-check
  const { data: conflicts } = await admin
    .from('bookings')
    .select('id')
    .eq('tutor_id', tutorId)
    .eq('status', 'CONFIRMED')
    .or(
      `and(confirmed_start_at.lt.${requestedEndAt},confirmed_end_at.gt.${requestedStartAt}),` +
        `and(requested_start_at.lt.${requestedEndAt},requested_end_at.gt.${requestedStartAt})`
    )
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    const { data: refundPayment } = await admin
      .from('payments')
      .insert({
        booking_id: null,
        payer_id: studentId,
        provider: 'lunipay',
        amount_ttd: priceTtd > 0 ? priceTtd : centsToTtd(session.amount ?? 0),
        status: 'succeeded',
        lunipay_checkout_session_id: session.id,
        lunipay_payment_id: session.payment_id,
        lunipay_payment_intent_id: session.payment_intent_id,
        provider_reference: session.id,
        paid_at: new Date().toISOString(),
        cancel_reason: 'slot_taken_after_payment_needs_refund',
        raw_provider_payload: { source: 'finalize', session },
      })
      .select('id')
      .single();

    return NextResponse.json({
      status: 'slot_conflict_needs_refund',
      paymentId: refundPayment?.id ?? null,
    });
  }

  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .insert({
      student_id: studentId,
      tutor_id: tutorId,
      subject_id: subjectId,
      session_type_id: sessionTypeId,
      requested_start_at: requestedStartAt,
      requested_end_at: requestedEndAt,
      confirmed_start_at: requestedStartAt,
      confirmed_end_at: requestedEndAt,
      duration_minutes: durationMinutes,
      status: 'CONFIRMED',
      last_action_by: 'student',
      student_notes: studentNotes,
      price_ttd: priceTtd,
      payer_id: studentId,
      payment_required: true,
      payment_status: 'paid',
      currency: 'TTD',
      platform_fee_pct: platformFeePct,
      platform_fee_ttd: platformFeeTtd,
      tutor_payout_ttd: tutorPayoutTtd,
    })
    .select('id, duration_minutes')
    .single();

  if (bookingError || !booking) {
    console.error('[lunipay/finalize] Failed to create booking:', bookingError);
    return NextResponse.json(
      { error: 'Failed to create booking', details: bookingError?.message },
      { status: 500 }
    );
  }

  const { data: payment } = await admin
    .from('payments')
    .insert({
      booking_id: booking.id,
      payer_id: studentId,
      provider: 'lunipay',
      amount_ttd: priceTtd,
      status: 'succeeded',
      lunipay_checkout_session_id: session.id,
      lunipay_payment_id: session.payment_id,
      lunipay_payment_intent_id: session.payment_intent_id,
      provider_reference: session.id,
      paid_at: new Date().toISOString(),
      raw_provider_payload: { source: 'finalize', session },
    })
    .select('id')
    .single();

  try {
    await createSessionForBooking(booking.id);
  } catch (err) {
    console.error('[lunipay/finalize] createSessionForBooking failed:', err);
  }

  await admin.from('notifications').insert([
    {
      user_id: studentId,
      type: 'payment_succeeded',
      title: 'Booking confirmed',
      message: `Your payment of $${priceTtd} TTD was successful and your session is booked.`,
      link: `/student/bookings`,
      created_at: new Date().toISOString(),
    },
    {
      user_id: tutorId,
      type: 'booking_confirmed',
      title: 'New paid booking',
      message: `You have a new paid booking (${booking.duration_minutes} minutes).`,
      link: `/tutor/sessions`,
      created_at: new Date().toISOString(),
    },
  ]);

  return NextResponse.json({
    status: 'created',
    paymentId: payment?.id ?? null,
    bookingId: booking.id,
  });
}
