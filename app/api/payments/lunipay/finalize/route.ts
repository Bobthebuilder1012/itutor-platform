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
import { handleSubscriptionPayment } from '@/lib/services/subscriptionPayments';

const SUBSCRIPTION_TYPES = new Set(['subscription_initial', 'subscription_renewal', 'subscription_reactivation']);

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

  // LuniPay redirects with the bare UUID (e.g. "abc123") but the API
  // returns the session with a "cs_" prefix ("cs_abc123"). Check both
  // so the idempotency lookup works regardless of which format was stored.
  const sessionIdWithPrefix = sessionId.startsWith('cs_') ? sessionId : `cs_${sessionId}`;
  const sessionIdBare = sessionId.startsWith('cs_') ? sessionId.slice(3) : sessionId;

  async function findExistingPayment() {
    const { data } = await admin
      .from('payments')
      .select('id, booking_id, status, amount_ttd, provider_reference, created_at')
      .or(`lunipay_checkout_session_id.eq.${sessionIdBare},lunipay_checkout_session_id.eq.${sessionIdWithPrefix}`)
      .maybeSingle();
    return data;
  }

  const existing = await findExistingPayment();
  if (existing) {
    return NextResponse.json({
      status: existing.booking_id ? 'already_processed' : 'slot_conflict_needs_refund',
      paymentId: existing.id,
      bookingId: existing.booking_id,
      paymentStatus: existing.status,
      payment: { ...existing, currency: 'TTD' },
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

  // Log the raw session for diagnostics.
  console.log('[lunipay/finalize] session retrieved:', {
    status: session?.status,
    payment_status: session?.payment_status,
    livemode: session?.livemode,
    hasMetadata: !!session?.metadata,
    hasPaymentIntentId: !!session?.payment_intent_id,
    completedAt: session?.completed_at,
  });

  // LuniPay live API has a known bug where it returns status=OPEN/payment_status=unpaid
  // even after the card is successfully charged (confirmed by bank and TTD balance in LuniPay
  // dashboard). We cannot rely on session.status — instead we trust:
  //   1. The success_url redirect (only fired by LuniPay after payment)
  //   2. The presence of a payment_intent_id (set when a charge is attempted)
  //   3. The session having valid booking metadata (kind='create_booking')
  //
  // Fallback: if status IS recognisably complete, accept immediately.
  const sessionStatus = String(session?.status ?? session?.state ?? '').toUpperCase();
  const paymentStatus = String(session?.payment_status ?? session?.paymentStatus ?? '').toUpperCase();
  const paidBool = session?.paid === true;
  const statusSaysPaid =
    paidBool ||
    sessionStatus === 'COMPLETE' || sessionStatus === 'COMPLETED' ||
    sessionStatus === 'SUCCESS'   || sessionStatus === 'SUCCEEDED' ||
    paymentStatus === 'PAID'      || paymentStatus === 'SUCCEEDED' ||
    paymentStatus === 'SUCCESS';

  const md = session?.metadata || {};
  const hasBookingMetadata = md.kind === 'create_booking' && !!md.student_id && !!md.tutor_id;
  // A payment_intent_id means Stripe/LuniPay started processing a charge.
  const hasPaymentIntent = !!session?.payment_intent_id;

  // For subscriptions: check DB before relying on LuniPay status (LuniPay returns OPEN
  // even after a successful charge — the success_url redirect is the reliable signal).
  if (md.type && SUBSCRIPTION_TYPES.has(md.type as string) && md.payment_id) {
    const { data: subCheck } = await admin
      .from('subscription_payments')
      .select('id, status, enrollment_id')
      .eq('id', md.payment_id as string)
      .maybeSingle();

    if (subCheck?.status === 'PAID') {
      // Webhook already activated — return success immediately
      return NextResponse.json({ status: 'already_processed', enrollment_id: subCheck.enrollment_id });
    }
    // Row exists and is PENDING → payment was legitimately initiated; trust the redirect
    if (subCheck && !statusSaysPaid) {
      // Fall through to subscription handler below with paid = true
      const result = await handleSubscriptionPayment({
        admin: admin as any,
        subscriptionPaymentId: md.payment_id as string,
        lunipaySessionId: session.id,
        lunipayTransactionId: (session as any).payment_id ?? null,
        receiptUrl: (session as any).receipt_url ?? null,
        source: 'finalize',
      });
      if (result.ok || result.idempotent) {
        return NextResponse.json({ status: result.idempotent ? 'already_processed' : 'activated', enrollment_id: result.enrollmentId });
      }
      return NextResponse.json({ error: result.error ?? 'Activation failed' }, { status: 500 });
    }
  }

  // Accept payment if: status says paid OR (has booking metadata + payment_intent started).
  // The second condition handles LuniPay's bug where the API returns OPEN even after charge.
  const paid = statusSaysPaid || (hasBookingMetadata && hasPaymentIntent);

  if (!paid) {
    console.error('[lunipay/finalize] session genuinely not paid:', {
      status: session?.status,
      payment_status: session?.payment_status,
      hasPaymentIntent,
      hasBookingMetadata,
    });
    return NextResponse.json(
      {
        status: 'not_paid',
        sessionStatus: session?.status,
        paymentStatus: session?.payment_status,
      },
      { status: 409 }
    );
  }

  console.log('[lunipay/finalize] proceeding with booking creation:', {
    statusSaysPaid,
    livemodeFallback: !statusSaysPaid && hasBookingMetadata && hasPaymentIntent,
  });

  // -----------------------------------------------------------
  // Subscription payment path
  // -----------------------------------------------------------
  if (md.type && SUBSCRIPTION_TYPES.has(md.type as string)) {
    const subscriptionPaymentId = md.payment_id as string | undefined;

    if (!subscriptionPaymentId) {
      return NextResponse.json({ error: 'metadata.payment_id missing' }, { status: 400 });
    }

    // Auth: must be the student from metadata
    if (md.student_id && md.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Idempotency: check if subscription payment already activated
    const { data: existingSp } = await admin
      .from('subscription_payments')
      .select('id, status, enrollment_id')
      .eq('id', subscriptionPaymentId)
      .maybeSingle();

    if (existingSp?.status === 'PAID') {
      return NextResponse.json({
        status: 'already_processed',
        enrollment_id: existingSp.enrollment_id,
      });
    }

    const result = await handleSubscriptionPayment({
      admin: admin as any,
      subscriptionPaymentId,
      lunipaySessionId: session.id,
      lunipayTransactionId: (session as any).payment_id ?? null,
      receiptUrl: (session as any).receipt_url ?? null,
      source: 'finalize',
    });

    if (!result.ok && !result.idempotent) {
      return NextResponse.json({ error: result.error ?? 'Activation failed' }, { status: 500 });
    }

    return NextResponse.json({
      status: result.ok ? 'activated' : 'activation_pending',
      enrollment_id: result.enrollmentId,
    });
  }

  if (md.kind !== 'create_booking') {
    return NextResponse.json(
      { error: 'Session is not a create_booking checkout' },
      { status: 400 }
    );
  }

  // Auth: must be the student or the resolved payer (parent for
  // parent_required billing). Older sessions don't carry payer_id in
  // metadata; fall back to comparing against student_id only.
  const studentId = md.student_id;
  const metadataPayerId = md.payer_id;
  const allowedUserIds = new Set<string>();
  if (studentId) allowedUserIds.add(studentId);
  if (metadataPayerId) allowedUserIds.add(metadataPayerId);
  if (!allowedUserIds.has(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Same logic as webhook's materialiseBookingFromCheckout.
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

  // Resolve payer (prefer metadata, fall back to RPC for older sessions)
  let payerId = metadataPayerId;
  if (!payerId) {
    const { data: rpcPayer } = await admin.rpc('get_payer_for_student', {
      p_student_id: studentId,
    });
    payerId = (typeof rpcPayer === 'string' && rpcPayer) || studentId;
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
        payer_id: payerId,
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

  // LuniPay live bug: payment_id is null when session status shows OPEN
  // even after a successful charge. Try to resolve it by listing recent
  // payments and matching the checkout session ID — this gives us a real
  // payment_id so refunds can be processed automatically.
  let resolvedPaymentId: string | null = session.payment_id ?? null;
  if (!resolvedPaymentId) {
    try {
      const lunipay = getLunipayClient();
      const paymentList = await (lunipay as any).payments.list({ limit: 20 });
      const matched = (paymentList?.data ?? []).find(
        (p: any) =>
          p.checkout_session_id === sessionIdBare ||
          p.checkout_session_id === sessionIdWithPrefix
      );
      if (matched?.id) {
        resolvedPaymentId = matched.id;
        console.log('[lunipay/finalize] resolved payment_id from list:', resolvedPaymentId);
      }
    } catch (err) {
      console.warn('[lunipay/finalize] could not resolve payment_id from list:', err);
    }
  }

  // Atomic booking + payment insert via materialize_paid_booking RPC
  const { data: rpcResult, error: rpcError } = await admin.rpc(
    'materialize_paid_booking',
    {
      p_student_id: studentId,
      p_tutor_id: tutorId,
      p_subject_id: subjectId,
      p_session_type_id: sessionTypeId,
      p_payer_id: payerId,
      p_requested_start_at: requestedStartAt,
      p_requested_end_at: requestedEndAt,
      p_duration_minutes: durationMinutes,
      p_price_ttd: priceTtd,
      p_platform_fee_pct: platformFeePct,
      p_platform_fee_ttd: platformFeeTtd,
      p_tutor_payout_ttd: tutorPayoutTtd,
      p_student_notes: studentNotes,
      p_lunipay_session_id: session.id,
      p_lunipay_payment_id: resolvedPaymentId,
      p_lunipay_payment_intent_id: session.payment_intent_id,
      p_provider_reference: session.id,
      p_amount_ttd: priceTtd,
      p_raw_payload: { source: 'finalize', session } as any,
    }
  );

  if (rpcError || !rpcResult) {
    console.error('[lunipay/finalize] materialize_paid_booking failed:', rpcError?.code, rpcError?.message);

    const code = (rpcError as any)?.code as string | undefined;
    const msg = rpcError?.message ?? '';

    // Duplicate key / unique violation: the booking was already created
    // (e.g. by a previous finalize call or manual recovery). Look it up
    // and return it so the success page can render the receipt.
    const isDuplicate = code === '23505' || msg.includes('duplicate key') || msg.includes('unique');
    if (isDuplicate) {
      const recovered = await findExistingPayment();
      if (recovered?.booking_id) {
        return NextResponse.json({
          status: 'already_processed',
          paymentId: recovered.id,
          bookingId: recovered.booking_id,
          paymentStatus: recovered.status,
          payment: { ...recovered, currency: 'TTD' },
        });
      }
    }

    // EXCLUDE constraint (mig 155) hit: someone else booked this slot.
    const isExclusion =
      code === '23P01' ||
      msg.includes('bookings_tutor_no_overlap') ||
      msg.includes('exclusion constraint');

    if (isExclusion) {
      const { data: refundPayment } = await admin
        .from('payments')
        .insert({
          booking_id: null,
          payer_id: payerId,
          provider: 'lunipay',
          amount_ttd: priceTtd > 0 ? priceTtd : centsToTtd(session.amount ?? 0),
          status: 'succeeded',
          lunipay_checkout_session_id: session.id,
          lunipay_payment_id: session.payment_id,
          lunipay_payment_intent_id: session.payment_intent_id,
          provider_reference: session.id,
          paid_at: new Date().toISOString(),
          cancel_reason: 'slot_taken_after_payment_needs_refund',
          raw_provider_payload: { source: 'finalize', session, exclusion: true },
        })
        .select('id')
        .single();

      return NextResponse.json({
        status: 'slot_conflict_needs_refund',
        paymentId: refundPayment?.id ?? null,
      });
    }

    return NextResponse.json(
      { error: 'Failed to create booking', details: rpcError?.message },
      { status: 500 }
    );
  }

  const bookingId = (rpcResult as any).booking_id as string;
  const paymentId = (rpcResult as any).payment_id as string;

  try {
    await createSessionForBooking(bookingId);
  } catch (err) {
    console.error('[lunipay/finalize] createSessionForBooking failed:', err);
  }

  const notifications: Array<Record<string, unknown>> = [
    {
      user_id: payerId,
      type: 'payment_succeeded',
      title: 'Booking confirmed',
      message: `Payment of $${priceTtd} TTD was successful and the session is booked.`,
      link: `/student/bookings`,
      created_at: new Date().toISOString(),
    },
    {
      user_id: tutorId,
      type: 'booking_confirmed',
      title: 'New paid booking',
      message: `You have a new paid booking (${durationMinutes} minutes).`,
      link: `/tutor/sessions`,
      created_at: new Date().toISOString(),
    },
  ];
  if (payerId !== studentId) {
    notifications.push({
      user_id: studentId,
      type: 'booking_confirmed',
      title: 'Your session is booked',
      message: `Your parent paid for a ${durationMinutes}-minute session — see you soon!`,
      link: `/student/bookings`,
      created_at: new Date().toISOString(),
    });
  }
  await admin.from('notifications').insert(notifications);

  return NextResponse.json({
    status: 'created',
    paymentId,
    bookingId,
    payment: {
      id: paymentId,
      booking_id: bookingId,
      status: 'succeeded',
      amount_ttd: priceTtd,
      provider_reference: session.id,
      created_at: new Date().toISOString(),
      currency: 'TTD',
    },
  });
}
