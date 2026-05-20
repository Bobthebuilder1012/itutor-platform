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
// Events handled:
//   - checkout.session.completed → mark succeeded, fire complete_booking_payment RPC
//   - checkout.session.expired   → mark cancelled, reset booking to unpaid
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  Webhook,
  WebhookSignatureError,
  type CheckoutSession,
  type LuniPayEvent,
} from 'lunipay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  // -----------------------------------------------------------
  // Resolve our local payment by metadata.payment_id, falling
  // back to lunipay_checkout_session_id.
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
      await admin
        .from('payments')
        .update({
          status: 'succeeded',
          paid_at: new Date().toISOString(),
          lunipay_payment_id: session.payment_id,
          lunipay_payment_intent_id: session.payment_intent_id,
          raw_provider_payload: { event_id: event.id, session },
        })
        .eq('id', payment.id);

      const { error: rpcError } = await admin.rpc('complete_booking_payment', {
        p_booking_id: payment.booking_id,
        p_payment_id: payment.id,
        p_provider_reference: session.id,
      });
      if (rpcError) {
        console.error(
          '[lunipay/webhook] complete_booking_payment RPC failed:',
          rpcError
        );
      }

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
          link: `/payments/${payment.id}/receipt`,
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
