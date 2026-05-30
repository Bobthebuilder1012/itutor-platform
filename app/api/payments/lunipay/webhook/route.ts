// =====================================================
// LUNIPAY WEBHOOK
// =====================================================
// POST /api/payments/lunipay/webhook
//
// Verifies the LuniPay-Signature header via the SDK's
// `Webhook.constructEvent` (HMAC-SHA256, 5-min replay window,
// timing-safe comparison) BEFORE any DB write.
//
// Idempotent on the `lunipay_webhook_events` table — duplicate
// deliveries (LuniPay retries identical bodies) are short-circuited.
//
// Events handled (legacy "pay for existing booking" flow):
//   - checkout.session.completed → mark succeeded, fire complete_booking_payment RPC
//   - checkout.session.expired   → mark cancelled, reset booking to unpaid
//   - payment_intent.*           → ack + log only (we act on the matching
//                                  checkout.session event)
//   - charge.refunded            → log warning if our DB doesn't already
//                                  reflect the refund (means it was issued
//                                  out-of-band via the LuniPay dashboard)
//   - charge.dispute.*           → flag payment with cancel_reason so the
//                                  admin sees it on the refund queue
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  Webhook,
  WebhookSignatureError,
  type CheckoutSession,
  type LuniPayEvent,
} from 'lunipay';
import { createSessionForBooking } from '@/lib/services/sessionService';
import { centsToTtd } from '@/lib/payments/lunipayClient';
import { handleSubscriptionPayment } from '@/lib/services/subscriptionPayments';

const SUBSCRIPTION_TYPES = new Set(['subscription_initial', 'subscription_renewal', 'subscription_reactivation']);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type AdminClient = SupabaseClient<any, 'public', 'public', any, any>;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.LUNIPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[lunipay/webhook] LUNIPAY_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    );
  }

  // CRITICAL: raw body string. Do NOT JSON.parse first — the
  // signature is computed over the exact bytes LuniPay sent.
  const rawBody = await request.text();
  const signature = request.headers.get('LuniPay-Signature');

  let event: LuniPayEvent<CheckoutSession>;
  try {
    event = Webhook.constructEvent<CheckoutSession>(rawBody, signature, secret);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      console.warn('[lunipay/webhook] Signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    console.error('[lunipay/webhook] Unexpected verification error:', err);
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  console.log(
    '[lunipay/webhook] Verified event:',
    JSON.stringify({ id: event.id, type: event.type, livemode: event.livemode })
  );

  const admin = getAdminClient();

  // -----------------------------------------------------------
  // De-duplicate by event.id.
  // -----------------------------------------------------------
  const { data: existing } = await admin
    .from('lunipay_webhook_events')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle();

  if (existing) {
    console.log(`[lunipay/webhook] Event ${event.id} already processed`);
    return NextResponse.json({ received: true, status: 'duplicate' });
  }

  const session = event.data.object;
  const paymentIdFromMetadata = session.metadata?.payment_id;
  const metadataKind = session.metadata?.kind;

  // -----------------------------------------------------------
  // create_booking flow: no booking/payment rows existed before
  // payment. Materialise both now that LuniPay confirms the
  // student paid. See app/api/bookings/direct-book/route.ts.
  // -----------------------------------------------------------
  if (
    metadataKind === 'create_booking' &&
    event.type === 'checkout.session.completed'
  ) {
    const result = await materialiseBookingFromCheckout(admin, event, session);

    // Only mark the event as processed when materialisation reached a
    // terminal state. `booking_insert_failed` is treated as transient
    // so LuniPay retries deliver another webhook and we get another
    // chance to insert the booking. `metadata_incomplete` is permanent
    // (retrying with the same payload won't change the metadata) so we
    // record it to stop the retry storm.
    const terminalStatuses = new Set([
      'already_processed',
      'created',
      'slot_conflict_needs_refund',
      'metadata_incomplete',
    ]);

    if (terminalStatuses.has(result.status)) {
      await admin.from('lunipay_webhook_events').insert({
        event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        payment_id: result.paymentId,
        raw_payload: event,
      });
      return NextResponse.json({ received: true, ...result });
    }

    // Transient failure (DB error on insert). Return 5xx so LuniPay
    // retries — DO NOT insert into lunipay_webhook_events or the
    // retry will be deduped and we'll permanently lose this booking.
    console.error(
      '[lunipay/webhook] Transient materialisation failure — leaving event un-deduped for retry',
      { event_id: event.id, status: result.status }
    );
    return NextResponse.json(
      { received: false, status: result.status, retry: true },
      { status: 503 }
    );
  }

  // -----------------------------------------------------------
  // Subscription payment flow: metadata.type is one of
  // subscription_initial | subscription_renewal | subscription_reactivation
  // -----------------------------------------------------------
  const metadataType = session.metadata?.type as string | undefined;

  if (metadataType && SUBSCRIPTION_TYPES.has(metadataType)) {
    const subscriptionPaymentId = session.metadata?.payment_id as string | undefined;

    if (!subscriptionPaymentId) {
      console.error('[lunipay/webhook] Subscription event missing payment_id in metadata:', session.metadata);
      await admin.from('lunipay_webhook_events').insert({
        event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        payment_id: null,
        subscription_payment_id: null,
        raw_payload: event,
        processing_status: 'failed',
        error_message: 'metadata.payment_id missing',
        processed_at: new Date().toISOString(),
      });
      return NextResponse.json({ received: true, status: 'metadata_incomplete' });
    }

    if (event.type === 'checkout.session.completed') {
      const result = await handleSubscriptionPayment({
        admin: admin as any,
        subscriptionPaymentId,
        lunipaySessionId: session.id,
        lunipayTransactionId: (session as any).payment_id ?? null,
        receiptUrl: (session as any).receipt_url ?? null,
        source: 'webhook',
      });

      await admin.from('lunipay_webhook_events').insert({
        event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        payment_id: null,
        subscription_payment_id: subscriptionPaymentId,
        raw_payload: event,
        processing_status: result.ok ? 'processed' : 'failed',
        error_message: result.ok ? null : (result.error ?? null),
        processed_at: new Date().toISOString(),
      });

      if (!result.ok && !result.idempotent) {
        // Return 503 only for transient errors so LuniPay retries.
        // Permanent failures (capacity_conflict, etc.) are logged above;
        // return 200 so retries don't loop.
        const isTransient = result.error?.includes('rpc_failed');
        if (isTransient) {
          return NextResponse.json({ received: false, status: result.error, retry: true }, { status: 503 });
        }
      }

      return NextResponse.json({ received: true, status: result.ok ? 'activated' : result.error });
    }

    // expired / other events for subscription checkouts — log and ack
    await admin.from('lunipay_webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      payment_id: null,
      subscription_payment_id: subscriptionPaymentId,
      raw_payload: event,
      processing_status: 'skipped',
      processed_at: new Date().toISOString(),
    });
    return NextResponse.json({ received: true, status: 'subscription_noop' });
  }

  // expired/cancelled events for the create_booking flow are a
  // no-op — there's nothing to roll back since no booking was
  // ever inserted. We still record the event id so retries don't
  // loop forever.
  if (metadataKind === 'create_booking') {
    await admin.from('lunipay_webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      payment_id: null,
      raw_payload: event,
    });
    return NextResponse.json({ received: true, status: 'noop_no_booking' });
  }

  // -----------------------------------------------------------
  // Legacy "pay for existing booking" flow: resolve the local
  // payment by metadata.payment_id, falling back to
  // lunipay_checkout_session_id.
  // -----------------------------------------------------------
  let lookup = admin
    .from('payments')
    .select('id, booking_id, payer_id, amount_ttd, status');

  if (paymentIdFromMetadata) {
    lookup = lookup.eq('id', paymentIdFromMetadata);
  } else {
    lookup = lookup.eq('lunipay_checkout_session_id', session.id);
  }

  const { data: payment, error: lookupError } = await lookup.maybeSingle();

  if (lookupError) {
    // Return 200 so LuniPay doesn't retry forever. A failed lookup is
    // almost always a permanent data condition (RLS, deleted booking,
    // schema drift) — retrying won't fix it. The error is logged for
    // operator follow-up; the next live event for this payment will
    // reconcile state if the underlying issue is fixed.
    console.error('[lunipay/webhook] Payment lookup error:', lookupError);
    return NextResponse.json({ received: true, status: 'lookup_failed' });
  }

  if (!payment) {
    console.warn(`[lunipay/webhook] No local payment for session ${session.id}`);
    // Record the event anyway so retries don't loop forever.
    await admin.from('lunipay_webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      payment_id: null,
      raw_payload: event,
    });
    return NextResponse.json({ received: true, status: 'no_payment' });
  }

  // -----------------------------------------------------------
  // Dispatch on event type.
  // -----------------------------------------------------------
  if (event.type === 'checkout.session.completed') {
    if (payment.status === 'succeeded') {
      console.log(`[lunipay/webhook] Payment ${payment.id} already succeeded`);
    } else {
      // Atomic: complete_booking_payment sets payment.status='succeeded'
      // AND bookings.payment_status='paid' in a single transaction. If it
      // fails we leave the payment row in its prior state and tell LuniPay
      // to retry — this avoids the previous bug where payment was marked
      // succeeded but the booking stayed unpaid.
      const { error: rpcError } = await admin.rpc('complete_booking_payment', {
        p_booking_id: payment.booking_id,
        p_payment_id: payment.id,
        p_provider_reference: session.id,
      });
      if (rpcError) {
        console.error(
          '[lunipay/webhook] complete_booking_payment RPC failed — leaving event un-deduped for retry:',
          rpcError
        );
        return NextResponse.json(
          { received: false, status: 'rpc_failed', retry: true },
          { status: 503 }
        );
      }

      // RPC succeeded. Layer on the LuniPay-specific provider fields that
      // the RPC doesn't know about. A failure here is non-fatal: the
      // payment is already marked succeeded with a provider_reference;
      // we can backfill from the polled session if needed.
      await admin
        .from('payments')
        .update({
          paid_at: new Date().toISOString(),
          lunipay_payment_id: session.payment_id,
          lunipay_payment_intent_id: session.payment_intent_id,
          raw_provider_payload: { event_id: event.id, session },
        })
        .eq('id', payment.id);

      const { data: bookingRow } = await admin
        .from('bookings')
        .select('tutor_id, duration_minutes')
        .eq('id', payment.booking_id)
        .single();

      const notifications: Array<Record<string, unknown>> = [
        {
          user_id: payment.payer_id,
          type: 'payment_succeeded',
          title: 'Payment confirmed',
          message: `Your payment of $${payment.amount_ttd} TTD was successful. Your booking is now being sent to the tutor.`,
          link: '/student/bookings',
          created_at: new Date().toISOString(),
        },
      ];

      if (bookingRow?.tutor_id) {
        notifications.push({
          user_id: bookingRow.tutor_id,
          type: 'booking_request_received',
          title: 'New paid booking',
          message: `You have a new paid booking request${
            bookingRow.duration_minutes ? ` (${bookingRow.duration_minutes} minutes)` : ''
          }.`,
          link: `/tutor/bookings/${payment.booking_id}`,
          created_at: new Date().toISOString(),
        });
      }

      const { error: notifyError } = await admin
        .from('notifications')
        .insert(notifications);
      if (notifyError) {
        console.warn('[lunipay/webhook] Failed to insert notifications:', notifyError);
      }
    }
  } else if (event.type === 'checkout.session.expired') {
    if (
      payment.status === 'initiated' ||
      payment.status === 'requires_action'
    ) {
      await admin
        .from('payments')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: 'session_expired',
          raw_provider_payload: { event_id: event.id, session },
        })
        .eq('id', payment.id);

      await admin
        .from('bookings')
        .update({ payment_status: 'unpaid' })
        .eq('id', payment.booking_id);

      await admin.from('notifications').insert({
        user_id: payment.payer_id,
        type: 'payment_failed',
        title: 'Payment session expired',
        message: `Your payment of $${payment.amount_ttd} TTD was not completed in time. Please try again.`,
        link: `/payments/checkout?bookingId=${payment.booking_id}`,
        created_at: new Date().toISOString(),
      });
    }
  } else if (event.type.startsWith('payment_intent.')) {
    // payment_intent events fire alongside checkout.session events for the
    // same payment. We act on the session events (they're more semantically
    // useful — payment_status, line_items, metadata are richer there).
    // Acknowledge without doing any state work so LuniPay stops retrying.
    console.log(
      `[lunipay/webhook] Acknowledging payment_intent event ${event.type} for payment ${payment.id}`
    );
  } else if (event.type === 'charge.refunded') {
    // If we initiated this refund via /api/admin/payments/[id]/refund, the
    // payment is already in 'refunded' or 'partially_refunded'. If it's not,
    // this is an out-of-band refund (operator hit refund directly in the
    // LuniPay dashboard) and we need to surface that for manual reconciliation.
    if (payment.status !== 'refunded' && payment.status !== 'partially_refunded') {
      console.warn(
        `[lunipay/webhook] Out-of-band refund detected on payment ${payment.id}; flagging for admin reconciliation`
      );
      await admin
        .from('payments')
        .update({
          cancel_reason: 'refunded_out_of_band',
          refunded_at: new Date().toISOString(),
        })
        .eq('id', payment.id);
    } else {
      console.log(
        `[lunipay/webhook] charge.refunded already reflected for payment ${payment.id}`
      );
    }
  } else if (event.type.startsWith('charge.dispute.')) {
    const phase = event.type.slice('charge.dispute.'.length); // created | closed | funds_withdrawn | etc.
    console.warn(
      `[lunipay/webhook] Dispute event ${event.type} on payment ${payment.id}`
    );
    await admin
      .from('payments')
      .update({ cancel_reason: `dispute_${phase}` })
      .eq('id', payment.id);
  } else {
    console.log(`[lunipay/webhook] Ignoring unhandled event type: ${event.type}`);
  }

  // -----------------------------------------------------------
  // Persist the event id to lock in idempotency.
  // -----------------------------------------------------------
  const { error: dedupeError } = await admin
    .from('lunipay_webhook_events')
    .insert({
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      payment_id: payment.id,
      raw_payload: event,
    });

  if (dedupeError) {
    // Most likely a race with a concurrent retry — log and move on.
    console.warn(
      '[lunipay/webhook] Failed to persist event id (probable race):',
      dedupeError.message
    );
  }

  return NextResponse.json({
    received: true,
    payment_id: payment.id,
    status: 'processed',
  });
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'itutor-lunipay-webhook',
  });
}

/**
 * Create a booking + payment row from the metadata of a successful
 * `create_booking` checkout session. Idempotent: if a payment row
 * for this session already exists, returns that.
 *
 * Does a defensive slot-conflict re-check against currently CONFIRMED
 * bookings — in the rare case the slot was claimed during the payment
 * window, we record the payment as needing a refund and notify the
 * student instead of creating an overlapping session.
 */
async function materialiseBookingFromCheckout(
  admin: AdminClient,
  event: LuniPayEvent<CheckoutSession>,
  session: CheckoutSession
): Promise<{
  status: string;
  paymentId: string | null;
  bookingId?: string | null;
}> {
  // ---- Idempotency: did we already create the booking? ----
  const { data: existingPayment } = await admin
    .from('payments')
    .select('id, booking_id, status')
    .eq('lunipay_checkout_session_id', session.id)
    .maybeSingle();

  if (existingPayment) {
    return {
      status: 'already_processed',
      paymentId: existingPayment.id,
      bookingId: existingPayment.booking_id,
    };
  }

  const md = session.metadata || {};
  const studentId = md.student_id;
  const tutorId = md.tutor_id;
  const subjectId = md.subject_id;
  const requestedStartAt = md.requested_start_at;
  const requestedEndAt = md.requested_end_at;

  if (!studentId || !tutorId || !subjectId || !requestedStartAt || !requestedEndAt) {
    console.error('[lunipay/webhook] create_booking metadata incomplete:', md);
    return { status: 'metadata_incomplete', paymentId: null };
  }

  // Trust the payer_id baked into metadata at checkout time. Fall back to
  // re-resolving via RPC for older sessions that predate the metadata field.
  let payerId = md.payer_id;
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

  // ---- Defensive slot-conflict re-check (race-condition guard) ----
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
    console.warn(
      `[lunipay/webhook] Slot conflict on payment success — session ${session.id} needs refund`
    );

    // Record the payment so an operator can issue a refund. No booking row.
    // Mig 150 dropped NOT NULL on payments.booking_id; the orphan-check
    // constraint requires cancel_reason to be set, which we do below.
    const { data: refundPayment } = await admin
      .from('payments')
      .insert({
        booking_id: null,
        payer_id: payerId,
        provider: 'lunipay',
        amount_ttd: priceTtd > 0 ? priceTtd : centsToTtd((session as any).amount ?? 0),
        status: 'succeeded',
        lunipay_checkout_session_id: session.id,
        lunipay_payment_id: (session as any).payment_id,
        lunipay_payment_intent_id: (session as any).payment_intent_id,
        provider_reference: session.id,
        paid_at: new Date().toISOString(),
        cancel_reason: 'slot_taken_after_payment_needs_refund',
        raw_provider_payload: { event_id: event.id, session },
      })
      .select('id')
      .single();

    await admin.from('notifications').insert({
      user_id: payerId,
      type: 'payment_failed',
      title: 'Booking unavailable — refund pending',
      message:
        'Your payment went through, but the time slot was taken before we could confirm your booking. We will refund you shortly.',
      link: '/student/bookings',
      created_at: new Date().toISOString(),
    });

    return {
      status: 'slot_conflict_needs_refund',
      paymentId: refundPayment?.id ?? null,
    };
  }

  // ---- Atomic booking + payment insert via RPC ----
  // materialize_paid_booking (mig 151) wraps both inserts in a single
  // PL/pgSQL transaction. If either insert fails the whole RPC rolls
  // back and we return booking_insert_failed, which the caller treats
  // as transient (LuniPay retries).
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
      p_lunipay_payment_id: (session as any).payment_id,
      p_lunipay_payment_intent_id: (session as any).payment_intent_id,
      p_provider_reference: session.id,
      p_amount_ttd: priceTtd,
      p_raw_payload: { event_id: event.id, session } as any,
    }
  );

  if (rpcError || !rpcResult) {
    console.error('[lunipay/webhook] materialize_paid_booking failed:', rpcError);

    // Mig 155 added an EXCLUDE constraint on bookings against double-
    // booked CONFIRMED slots. If two webhooks raced past the soft
    // SELECT above and one lost on the constraint, treat that as a
    // terminal slot conflict (insert an orphan payment for refund)
    // rather than telling LuniPay to retry — the retry would lose
    // again the same way.
    const code = (rpcError as any)?.code as string | undefined;
    const msg = rpcError?.message ?? '';
    const isExclusion =
      code === '23P01' ||
      msg.includes('bookings_tutor_no_overlap') ||
      msg.includes('exclusion constraint');

    if (isExclusion) {
      console.warn(
        `[lunipay/webhook] EXCLUDE constraint hit on session ${session.id}; converting to slot-conflict refund`
      );
      const { data: refundPayment } = await admin
        .from('payments')
        .insert({
          booking_id: null,
          payer_id: payerId,
          provider: 'lunipay',
          amount_ttd: priceTtd > 0 ? priceTtd : centsToTtd((session as any).amount ?? 0),
          status: 'succeeded',
          lunipay_checkout_session_id: session.id,
          lunipay_payment_id: (session as any).payment_id,
          lunipay_payment_intent_id: (session as any).payment_intent_id,
          provider_reference: session.id,
          paid_at: new Date().toISOString(),
          cancel_reason: 'slot_taken_after_payment_needs_refund',
          raw_provider_payload: { event_id: event.id, session, exclusion: true },
        })
        .select('id')
        .single();

      await admin.from('notifications').insert({
        user_id: payerId,
        type: 'payment_failed',
        title: 'Booking unavailable — refund pending',
        message:
          'Your payment went through, but the time slot was taken before we could confirm your booking. We will refund you shortly.',
        link: '/student/bookings',
        created_at: new Date().toISOString(),
      });

      return {
        status: 'slot_conflict_needs_refund',
        paymentId: refundPayment?.id ?? null,
      };
    }

    return { status: 'booking_insert_failed', paymentId: null };
  }

  const bookingId = (rpcResult as any).booking_id as string;
  const paymentId = (rpcResult as any).payment_id as string;

  // Provision meeting link (Google Meet / Zoom). Best-effort; a
  // failure here does NOT void the booking.
  try {
    await createSessionForBooking(bookingId);
  } catch (err) {
    console.error('[lunipay/webhook] createSessionForBooking failed:', err);
  }

  // Notify the payer (could be a parent for parent_required students).
  // If the payer isn't the student, also notify the student so the kid
  // knows their session is booked.
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

  return {
    status: 'created',
    paymentId,
    bookingId,
  };
}
