// =====================================================
// STRIPE IDENTITY WEBHOOK
// =====================================================
// POST /api/webhooks/stripe-identity
//
// Its own endpoint with its own signing secret (STRIPE_IDENTITY_WEBHOOK_SECRET),
// deliberately NOT part of the payment webhook, so a change here cannot affect
// payments and a leaked or rotated secret here cannot forge a payment event.
//
//   - Verifies the Stripe-Signature over the RAW body before anything else.
//   - Idempotent: identity_webhook_events is keyed on the Stripe event id. A
//     processed event is acknowledged as a duplicate and does nothing.
//   - Stores no payload. Only the event id, type, session id and our result.
//     Nothing from the Stripe object is logged.
//   - Handles identity.verification_session.verified and .requires_input.
//     Anything else is acknowledged and ignored.
//   - Off unless VERIFICATION_V2_ENABLED=true: acknowledged and ignored with no
//     database access, so an unapplied migration cannot make Stripe retry.

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/payments/stripeClient';
import { getServiceClient } from '@/lib/supabase/server';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { applyIdentityEvent } from '@/lib/verificationV2/identityWebhook';
import type { Db } from '@/lib/verification/setStatus';

export const dynamic = 'force-dynamic';
// MUST be nodejs: constructEvent needs the raw body bytes and Node crypto.
export const runtime = 'nodejs';

/** Give up after this many deliveries of the same event. */
const MAX_ATTEMPTS = 5;

const HANDLED = new Set([
  'identity.verification_session.verified',
  'identity.verification_session.requires_input',
]);

type Outcome = 'processed' | 'skipped' | 'failed' | 'abandoned';

async function record(
  db: Db,
  event: Stripe.Event,
  outcome: Outcome,
  attempts: number,
  errorMessage?: string
): Promise<boolean> {
  const sessionId = (event.data.object as { id?: string })?.id ?? null;
  const { error } = await db.from('identity_webhook_events').upsert(
    {
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      session_id: sessionId,
      processing_status: outcome,
      attempts,
      error_message: errorMessage ?? null,
      processed_at: outcome === 'failed' ? null : new Date().toISOString(),
    },
    { onConflict: 'event_id' }
  );
  if (error) console.error('[stripe-identity] could not record event:', error.message);
  return !error;
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe-identity] STRIPE_IDENTITY_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // CRITICAL: the raw body string. The signature is over the exact bytes sent.
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature ?? '', secret);
  } catch (err) {
    console.warn('[stripe-identity] signature verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log(
    '[stripe-identity] verified event:',
    JSON.stringify({ id: event.id, type: event.type, livemode: event.livemode })
  );

  if (!isVerificationV2Enabled() || !HANDLED.has(event.type)) {
    return NextResponse.json({ received: true, status: 'ignored' });
  }

  const db = getServiceClient() as Db;

  // De-duplicate on the event id. Only a finished row is terminal; a 'failed'
  // row stays retryable.
  const { data: existing, error: readError } = await db
    .from('identity_webhook_events')
    .select('event_id, processing_status, attempts')
    .eq('event_id', event.id)
    .maybeSingle();

  if (readError) {
    // Without a readable table idempotency cannot be guaranteed. Let Stripe retry.
    console.error('[stripe-identity] de-dup table unreadable:', readError.message);
    return NextResponse.json({ received: false, status: 'dedupe_unavailable', retry: true }, { status: 500 });
  }

  if (
    existing &&
    (existing.processing_status === 'processed' ||
      existing.processing_status === 'skipped' ||
      existing.processing_status === 'abandoned')
  ) {
    return NextResponse.json({ received: true, status: 'duplicate' });
  }

  const attempts = (existing?.attempts ?? 0) + 1;
  if (attempts > MAX_ATTEMPTS) {
    await record(db, event, 'abandoned', attempts, `Exceeded ${MAX_ATTEMPTS} processing attempts`);
    return NextResponse.json({ received: true, status: 'abandoned' });
  }

  try {
    const result = await applyIdentityEvent(event, db);
    const saved = await record(db, event, result === 'applied' ? 'processed' : 'skipped', attempts);
    if (!saved) {
      // The change is applied (and applying again is harmless), but the event is
      // not marked done: ask Stripe to redeliver so it is.
      return NextResponse.json({ received: false, status: 'record_failed', retry: true }, { status: 500 });
    }
    return NextResponse.json({ received: true, status: result });
  } catch (err) {
    const message = (err as Error).message ?? 'unknown error';
    console.error('[stripe-identity] processing error, will retry:', message);
    await record(db, event, 'failed', attempts, message);
    return NextResponse.json({ received: false, status: 'processing_error', retry: true }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'itutor-stripe-identity-webhook' });
}
