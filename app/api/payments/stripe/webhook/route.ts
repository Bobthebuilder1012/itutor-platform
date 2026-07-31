// =====================================================
// STRIPE WEBHOOK
// =====================================================
// POST /api/payments/stripe/webhook
//
// Verifies the Stripe-Signature header via the SDK's
// `webhooks.constructEvent` BEFORE any DB write. Unverified
// payloads are rejected with 400 and never touch the database.
//
// THE WEBHOOK IS THE ONLY SOURCE OF TRUTH FOR PAYMENT STATUS.
// The client-side confirmPayment result is advisory only — a closed
// tab or dropped connection after Stripe processes the card would
// lose it. Nothing marks a booking paid except this handler.
//
// Idempotency: `stripe_webhook_events` keyed on the Stripe event id.
// A row is only treated as a duplicate once processing_status is
// 'processed'. Transient failures return 5xx WITHOUT locking in a
// processed row, so Stripe's retry (exponential backoff, ~3 days)
// gets another go. The attempts counter caps that at MAX_ATTEMPTS
// so a poison-pill event can't retry indefinitely.
//
// Events handled:
//   - payment_intent.succeeded      → complete_booking_payment RPC
//   - payment_intent.payment_failed → mark failed, booking back to unpaid
//   - charge.refunded               → mark (partially_)refunded, reverse ledger
//   - charge.dispute.created        → open a payout_cases chargeback hold
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import {
  getStripeClient,
  centsToTtd,
  extractChargeFees,
} from '@/lib/payments/stripeClient';
import { createSessionForBooking } from '@/lib/services/sessionService';
import { sendEmail } from '@/lib/services/emailService';
import {
  buildReceiptData,
  renderReceiptHtml,
  receiptSubject,
  renderTutorBookingHtml,
  tutorBookingSubject,
} from '@/lib/payments/receipt';

export const dynamic = 'force-dynamic';
// MUST be nodejs: constructEvent needs the raw body bytes and Node crypto.
export const runtime = 'nodejs';

type AdminClient = SupabaseClient<any, 'public', 'public', any, any>;

/** Give up after this many deliveries of the same event. */
const MAX_ATTEMPTS = 5;

function getAdminClient(): AdminClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

type LocalPayment = {
  id: string;
  booking_id: string | null;
  payer_id: string;
  amount_ttd: number;
  status: string;
};

/**
 * Emails the receipt for a completed payment.
 *
 * Sent from the webhook, not the client, so it fires even when the student
 * closes the tab before the redirect. Duplicate sends are prevented by the
 * handler's existing event idempotency: a redelivered event short-circuits
 * on stripe_webhook_events before reaching this call.
 *
 * FULLY NON-FATAL. The payment succeeding is the state that matters; a
 * bounced email must never fail the handler, because returning 5xx here
 * would make Stripe redeliver and re-run booking side effects. Every error
 * is swallowed and logged.
 *
 * Note sendEmail() itself no-ops when RESEND_API_KEY is unset, so staging
 * without mail configured logs instead of sending.
 */
async function sendReceiptEmail(admin: AdminClient, paymentId: string) {
  try {
    const data = await buildReceiptData(admin, paymentId);
    if (!data) {
      console.warn(`[stripe/webhook] No receipt data for payment ${paymentId}`);
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    // Each recipient is sent independently and awaited via allSettled, so a
    // bounce on one address cannot suppress the other. The payer's receipt
    // and the tutor's booking notice are separate concerns.
    const jobs: Array<{ label: string; run: () => Promise<unknown> }> = [];

    if (data.payerEmail) {
      jobs.push({
        label: `receipt→${data.payerEmail}`,
        run: () =>
          sendEmail({
            to: data.payerEmail!,
            subject: receiptSubject(data),
            html: renderReceiptHtml(data, { appUrl }),
          }),
      });
    } else {
      console.warn(
        `[stripe/webhook] Payer has no email on file; skipping receipt for ${paymentId}`
      );
    }

    if (data.tutorEmail) {
      jobs.push({
        label: `tutor-booking→${data.tutorEmail}`,
        run: () =>
          sendEmail({
            to: data.tutorEmail!,
            subject: tutorBookingSubject(data),
            html: renderTutorBookingHtml(data, { appUrl }),
          }),
      });
    } else {
      console.warn(
        `[stripe/webhook] Tutor has no email on file; skipping booking notice for ${paymentId}`
      );
    }

    const results = await Promise.allSettled(jobs.map((j) => j.run()));
    results.forEach((r, i) => {
      const label = jobs[i].label;
      if (r.status === 'rejected') {
        console.error(`[stripe/webhook] ${label} threw:`, r.reason);
      } else {
        const v = r.value as { success?: boolean; error?: string; messageId?: string };
        if (v?.success) {
          console.log(`[stripe/webhook] ${label} sent (${v.messageId})`);
        } else {
          console.error(`[stripe/webhook] ${label} failed: ${v?.error}`);
        }
      }
    });
  } catch (err) {
    console.error('[stripe/webhook] Payment emails threw (non-fatal):', err);
  }
}

/** Records the event as terminally handled so retries short-circuit. */
async function markProcessed(
  admin: AdminClient,
  event: Stripe.Event,
  paymentId: string | null,
  status: 'processed' | 'skipped' | 'abandoned',
  attempts: number,
  errorMessage?: string
) {
  const { error } = await admin.from('stripe_webhook_events').upsert(
    {
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      payment_id: paymentId,
      raw_payload: event as unknown as Record<string, unknown>,
      processing_status: status,
      error_message: errorMessage ?? null,
      attempts,
      processed_at: new Date().toISOString(),
    },
    { onConflict: 'event_id' }
  );

  if (error) {
    // Most likely a race with a concurrent retry — log and move on.
    console.warn(
      '[stripe/webhook] Failed to persist event id (probable race):',
      error.message
    );
  }
}

/**
 * Records a failed attempt WITHOUT marking the event processed, so the
 * next Stripe delivery reprocesses it.
 */
async function markRetryable(
  admin: AdminClient,
  event: Stripe.Event,
  paymentId: string | null,
  attempts: number,
  errorMessage: string
) {
  await admin.from('stripe_webhook_events').upsert(
    {
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      payment_id: paymentId,
      raw_payload: event as unknown as Record<string, unknown>,
      processing_status: 'failed',
      error_message: errorMessage,
      attempts,
      processed_at: null,
    },
    { onConflict: 'event_id' }
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    );
  }

  // CRITICAL: raw body string. Do NOT JSON.parse first — the signature
  // is computed over the exact bytes Stripe sent.
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature ?? '', secret);
  } catch (err) {
    console.warn(
      '[stripe/webhook] Signature verification failed:',
      (err as Error).message
    );
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log(
    '[stripe/webhook] Verified event:',
    JSON.stringify({ id: event.id, type: event.type, livemode: event.livemode })
  );

  const admin = getAdminClient();

  // -----------------------------------------------------------
  // De-duplicate by event.id. Only a 'processed' row is terminal —
  // 'failed' rows are deliberately left retryable.
  // -----------------------------------------------------------
  const { data: existing, error: dedupeReadError } = await admin
    .from('stripe_webhook_events')
    .select('event_id, processing_status, attempts')
    .eq('event_id', event.id)
    .maybeSingle();

  if (dedupeReadError && isRetryablePgError(dedupeReadError)) {
    // Without a readable de-dup table we cannot guarantee idempotency,
    // and processing anyway risks double-crediting a payment. Bail out
    // and let Stripe redeliver once the table is reachable.
    console.error(
      '[stripe/webhook] De-dup table unreadable — refusing to process without idempotency:',
      dedupeReadError
    );
    return NextResponse.json(
      { received: false, status: 'dedupe_unavailable', retry: true },
      { status: 500 }
    );
  }

  if (
    existing &&
    (existing.processing_status === 'processed' ||
      existing.processing_status === 'skipped' ||
      existing.processing_status === 'abandoned')
  ) {
    console.log(`[stripe/webhook] Event ${event.id} already processed`);
    return NextResponse.json({ received: true, status: 'duplicate' });
  }

  const attempts = (existing?.attempts ?? 0) + 1;

  if (attempts > MAX_ATTEMPTS) {
    console.error(
      `[stripe/webhook] Event ${event.id} exceeded ${MAX_ATTEMPTS} attempts — abandoning`
    );
    await markProcessed(
      admin,
      event,
      null,
      'abandoned',
      attempts,
      `Exceeded ${MAX_ATTEMPTS} processing attempts`
    );
    return NextResponse.json({ received: true, status: 'abandoned' });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        return await handleIntentSucceeded(admin, event, attempts);
      case 'payment_intent.payment_failed':
        return await handleIntentFailed(admin, event, attempts);
      case 'charge.refunded':
        return await handleChargeRefunded(admin, event, attempts);
      case 'charge.dispute.created':
        return await handleDisputeCreated(admin, event, attempts);
      case 'charge.updated':
        return await handleChargeUpdated(admin, event, attempts);
      default:
        console.log(
          `[stripe/webhook] Ignoring unhandled event type: ${event.type}`
        );
        await markProcessed(admin, event, null, 'skipped', attempts);
        return NextResponse.json({ received: true, status: 'ignored' });
    }
  } catch (err) {
    // Unexpected error AFTER signature verification. Leave the event
    // retryable and ask Stripe to redeliver.
    const message = (err as Error).message ?? 'unknown error';
    console.error('[stripe/webhook] Processing error — will retry:', err);
    await markRetryable(admin, event, null, attempts, message);
    return NextResponse.json(
      { received: false, status: 'processing_error', retry: true },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'itutor-stripe-webhook',
  });
}

/**
 * Postgres error classes that mean "the database isn't in the shape we
 * expect *yet*" rather than "this data is permanently bad".
 *
 * The distinction matters: an unapplied migration would otherwise make
 * every lookup fail, and if we ACKed those with a 200 we would silently
 * discard real payments. These self-heal the moment the migration lands,
 * which is comfortably inside Stripe's ~3-day retry window — so they must
 * return 5xx and be retried.
 *
 *   42P01 undefined_table      53300 too_many_connections
 *   42703 undefined_column     57P01 admin_shutdown
 *   42P02 undefined_parameter  57P03 cannot_connect_now
 *   08xxx connection_exception 40001 serialization_failure
 *   40P01 deadlock_detected    XX000 internal_error
 *
 * PostgREST also reports a missing table as PGRST205 with no PG code.
 */
function isRetryablePgError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const code = error.code ?? '';
  if (
    code === '42P01' ||
    code === '42703' ||
    code === '42P02' ||
    code === '53300' ||
    code === '57P01' ||
    code === '57P03' ||
    code === '40001' ||
    code === '40P01' ||
    code === 'XX000' ||
    code.startsWith('08')
  ) {
    return true;
  }
  // PostgREST schema-cache miss (table not found) has no PG code.
  if (code.startsWith('PGRST')) return true;
  return /schema cache|does not exist/i.test(error.message ?? '');
}

/**
 * Resolves our local payments row from the event. Prefers
 * metadata.payment_id (set at initiate time), falling back to the
 * PaymentIntent id.
 *
 * `retryable` distinguishes "database isn't ready" (redeliver) from
 * "this payment genuinely isn't ours" (ack and move on).
 */
async function findLocalPayment(
  admin: AdminClient,
  paymentIntentId: string | null,
  metadataPaymentId: string | undefined
): Promise<{
  payment: LocalPayment | null;
  lookupFailed: boolean;
  retryable: boolean;
}> {
  let lookup = admin
    .from('payments')
    .select('id, booking_id, payer_id, amount_ttd, status');

  if (metadataPaymentId) {
    lookup = lookup.eq('id', metadataPaymentId);
  } else if (paymentIntentId) {
    lookup = lookup.eq('stripe_payment_intent_id', paymentIntentId);
  } else {
    return { payment: null, lookupFailed: false, retryable: false };
  }

  const { data, error } = await lookup.maybeSingle();
  if (error) {
    const retryable = isRetryablePgError(error);
    console.error(
      `[stripe/webhook] Payment lookup error (${retryable ? 'RETRYABLE' : 'permanent'}):`,
      error
    );
    return { payment: null, lookupFailed: true, retryable };
  }
  return {
    payment: (data as LocalPayment) ?? null,
    lookupFailed: false,
    retryable: false,
  };
}

// -----------------------------------------------------------------
// payment_intent.succeeded
// -----------------------------------------------------------------
async function handleIntentSucceeded(
  admin: AdminClient,
  event: Stripe.Event,
  attempts: number
) {
  const intent = event.data.object as Stripe.PaymentIntent;

  // -----------------------------------------------------------
  // create_booking flow (the 1:1 "Book a session" modal): no booking
  // or payment row existed before payment. Materialise both now that
  // Stripe confirms the student paid.
  // See app/api/bookings/direct-book/route.ts.
  // -----------------------------------------------------------
  if (intent.metadata?.kind === 'create_booking') {
    const result = await materialiseBookingFromIntent(admin, event, intent);

    // Only mark the event processed when materialisation reached a
    // terminal state. 'booking_insert_failed' is transient — leave it
    // retryable so Stripe redelivers and we get another chance to insert
    // the booking, otherwise we'd keep the money and lose the session.
    const terminalStatuses = new Set([
      'already_processed',
      'created',
      'slot_conflict_needs_refund',
      'metadata_incomplete',
    ]);

    if (terminalStatuses.has(result.status)) {
      await markProcessed(admin, event, result.paymentId, 'processed', attempts);
      return NextResponse.json({ received: true, ...result });
    }

    console.error(
      '[stripe/webhook] Transient materialisation failure — leaving event un-deduped for retry',
      { event_id: event.id, status: result.status }
    );
    await markRetryable(admin, event, null, attempts, result.status);
    return NextResponse.json(
      { received: false, status: result.status, retry: true },
      { status: 500 }
    );
  }

  const { payment, lookupFailed, retryable } = await findLocalPayment(
    admin,
    intent.id,
    intent.metadata?.payment_id
  );

  if (lookupFailed && retryable) {
    // The database isn't in the expected shape yet (missing migration,
    // connection trouble). ACKing here would silently discard a real
    // payment — return 5xx so Stripe redelivers once it's fixed.
    console.error(
      '[stripe/webhook] Lookup failed on a retryable condition — asking Stripe to redeliver'
    );
    await markRetryable(admin, event, null, attempts, 'lookup_retryable');
    return NextResponse.json(
      { received: false, status: 'lookup_retryable', retry: true },
      { status: 500 }
    );
  }

  if (lookupFailed) {
    // Genuinely permanent (RLS, malformed id) — retrying won't fix it.
    // Ack so Stripe stops, and log loudly for operator follow-up.
    await markProcessed(
      admin,
      event,
      null,
      'skipped',
      attempts,
      'payment lookup failed'
    );
    return NextResponse.json({ received: true, status: 'lookup_failed' });
  }

  if (!payment) {
    console.warn(`[stripe/webhook] No local payment for intent ${intent.id}`);
    await markProcessed(admin, event, null, 'skipped', attempts, 'no local payment');
    return NextResponse.json({ received: true, status: 'no_payment' });
  }

  if (payment.status === 'succeeded') {
    console.log(`[stripe/webhook] Payment ${payment.id} already succeeded`);
    await markProcessed(admin, event, payment.id, 'processed', attempts);
    return NextResponse.json({ received: true, status: 'already_succeeded' });
  }

  if (!payment.booking_id) {
    console.error(
      `[stripe/webhook] Payment ${payment.id} has no booking_id — cannot complete`
    );
    await markProcessed(
      admin,
      event,
      payment.id,
      'skipped',
      attempts,
      'payment has no booking_id'
    );
    return NextResponse.json({ received: true, status: 'no_booking' });
  }

  // Atomic: complete_booking_payment sets payments.status='succeeded' AND
  // bookings.payment_status='paid' in a single transaction (migrations
  // 021 / 153 — the documented single source of truth for this flip).
  // It also guards against double-processing internally.
  const { error: rpcError } = await admin.rpc('complete_booking_payment', {
    p_booking_id: payment.booking_id,
    p_payment_id: payment.id,
    p_provider_reference: intent.id,
  });

  if (rpcError) {
    // Transient — leave retryable so Stripe redelivers.
    console.error(
      '[stripe/webhook] complete_booking_payment RPC failed — leaving event un-deduped for retry:',
      rpcError
    );
    await markRetryable(
      admin,
      event,
      payment.id,
      attempts,
      `rpc_failed: ${rpcError.message}`
    );
    return NextResponse.json(
      { received: false, status: 'rpc_failed', retry: true },
      { status: 500 }
    );
  }

  // ---- Best-effort: record Stripe's actual processing fee ----
  // Purely for reconciliation against the gross-up we charged. A failure
  // here must never undo a confirmed payment, so it's fully swallowed.
  const providerFields: Record<string, unknown> = {
    paid_at: new Date().toISOString(),
    stripe_payment_intent_id: intent.id,
    raw_provider_payload: { event_id: event.id, intent },
  };

  try {
    const chargeId =
      typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : intent.latest_charge?.id;

    if (chargeId) {
      const stripe = getStripeClient();
      const charge = await stripe.charges.retrieve(chargeId, {
        expand: ['balance_transaction'],
      });
      const fees = extractChargeFees(charge);
      providerFields.stripe_charge_id = charge.id;
      providerFields.stripe_balance_txn_id = fees.balanceTxnId;
      providerFields.stripe_fee_ttd = fees.feeTtd;
      providerFields.stripe_net_ttd = fees.netTtd;
      providerFields.stripe_settlement_currency = fees.settlementCurrency;

      // Reconcile the gross-up estimate against what Stripe actually
      // took. The tutor's payout is fixed regardless — this variance
      // lands on the platform, so it needs to be visible, not absorbed.
      const { data: chargedRow } = await admin
        .from('payments')
        .select('charged_processing_fee_ttd')
        .eq('id', payment.id)
        .maybeSingle();

      const charged = chargedRow?.charged_processing_fee_ttd;
      if (charged != null && fees.feeTtd != null) {
        const variance = Math.round((Number(charged) - fees.feeTtd) * 100) / 100;
        providerFields.fee_variance_ttd = variance;

        if (variance < 0) {
          console.warn(
            `[stripe/webhook] UNDER-COLLECTED on payment ${payment.id}: charged TT$${charged} processing fee, Stripe took TT$${fees.feeTtd} (variance TT$${variance}). The gross-up rate in lib/payments/grossUp.ts is too low.`
          );
        }
      }
    }
  } catch (feeError) {
    console.warn(
      '[stripe/webhook] Could not capture balance_transaction fee:',
      feeError
    );
  }

  await admin.from('payments').update(providerFields).eq('id', payment.id);

  // ---- Notifications ----
  // NOTE: payout_ledger is intentionally NOT written here. Ledger rows
  // are created by fn_create_earning_on_charge (migration 163) when
  // sessions.charged_at is set — at payment time no session row exists
  // yet and payout_ledger.session_id is NOT NULL UNIQUE.
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
        bookingRow.duration_minutes
          ? ` (${bookingRow.duration_minutes} minutes)`
          : ''
      }.`,
      link: `/tutor/bookings/${payment.booking_id}`,
      created_at: new Date().toISOString(),
    });
  }

  const { error: notifyError } = await admin
    .from('notifications')
    .insert(notifications);
  if (notifyError) {
    console.warn('[stripe/webhook] Failed to insert notifications:', notifyError);
  }

  await sendReceiptEmail(admin, payment.id);

  await markProcessed(admin, event, payment.id, 'processed', attempts);
  return NextResponse.json({
    received: true,
    payment_id: payment.id,
    status: 'processed',
  });
}

/**
 * Create a booking + payment row from the metadata of a succeeded
 * `create_booking` PaymentIntent. Idempotent: if a payment row for this
 * intent already exists, returns that.
 *
 * Does a defensive slot-conflict re-check against currently CONFIRMED
 * bookings — in the rare case the slot was claimed during the payment
 * window, we record the payment as needing a refund and notify the
 * student instead of creating an overlapping session.
 *
 * Ported from materialiseBookingFromCheckout in the LuniPay webhook.
 */
async function materialiseBookingFromIntent(
  admin: AdminClient,
  event: Stripe.Event,
  intent: Stripe.PaymentIntent
): Promise<{ status: string; paymentId: string | null; bookingId?: string | null }> {
  // ---- Idempotency: did we already create the booking? ----
  const { data: existingPayment } = await admin
    .from('payments')
    .select('id, booking_id, status')
    .eq('stripe_payment_intent_id', intent.id)
    .maybeSingle();

  if (existingPayment) {
    return {
      status: 'already_processed',
      paymentId: existingPayment.id,
      bookingId: existingPayment.booking_id,
    };
  }

  const md = intent.metadata || {};
  const studentId = md.student_id;
  const tutorId = md.tutor_id;
  const subjectId = md.subject_id;
  const requestedStartAt = md.requested_start_at;
  const requestedEndAt = md.requested_end_at;

  if (!studentId || !tutorId || !subjectId || !requestedStartAt || !requestedEndAt) {
    console.error('[stripe/webhook] create_booking metadata incomplete:', md);
    return { status: 'metadata_incomplete', paymentId: null };
  }

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
  const processingFeeTtd = Number(md.processing_fee_ttd ?? '0');
  const studentNotes = md.student_notes || null;

  const chargeId =
    typeof intent.latest_charge === 'string'
      ? intent.latest_charge
      : intent.latest_charge?.id ?? null;

  // amount_ttd records what the student was actually charged (grossed up),
  // matching the LuniPay behaviour of storing the full captured amount.
  const amountTtd = centsToTtd(intent.amount_received || intent.amount);

  const refundCasePayload = (extra: Record<string, unknown> = {}) => ({
    booking_id: null,
    payer_id: payerId,
    provider: 'stripe',
    amount_ttd: amountTtd,
    status: 'succeeded',
    stripe_payment_intent_id: intent.id,
    stripe_charge_id: chargeId,
    charged_processing_fee_ttd: processingFeeTtd,
    provider_reference: intent.id,
    paid_at: new Date().toISOString(),
    cancel_reason: 'slot_taken_after_payment_needs_refund',
    raw_provider_payload: { event_id: event.id, intent, ...extra },
  });

  const notifySlotTaken = async () => {
    await admin.from('notifications').insert({
      user_id: payerId,
      type: 'payment_failed',
      title: 'Booking unavailable — refund pending',
      message:
        'Your payment went through, but the time slot was taken before we could confirm your booking. We will refund you shortly.',
      link: '/student/bookings',
      created_at: new Date().toISOString(),
    });
  };

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
      `[stripe/webhook] Slot conflict on payment success — intent ${intent.id} needs refund`
    );
    const { data: refundPayment } = await admin
      .from('payments')
      .insert(refundCasePayload())
      .select('id')
      .single();

    await notifySlotTaken();
    return { status: 'slot_conflict_needs_refund', paymentId: refundPayment?.id ?? null };
  }

  // ---- Atomic booking + payment insert via RPC (migration 198) ----
  const { data: rpcResult, error: rpcError } = await admin.rpc(
    'materialize_paid_booking_stripe',
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
      p_stripe_payment_intent_id: intent.id,
      p_stripe_charge_id: chargeId,
      p_provider_reference: intent.id,
      p_amount_ttd: amountTtd,
      p_charged_processing_fee_ttd: processingFeeTtd,
      p_raw_payload: { event_id: event.id, intent } as any,
    }
  );

  if (rpcError || !rpcResult) {
    console.error('[stripe/webhook] materialize_paid_booking_stripe failed:', rpcError);

    // Migration 155 added an EXCLUDE constraint against double-booked
    // CONFIRMED slots. If two webhooks raced past the soft SELECT above
    // and one lost, treat it as a terminal slot conflict (refund) rather
    // than telling Stripe to retry — the retry would lose the same way.
    const code = (rpcError as any)?.code as string | undefined;
    const msg = rpcError?.message ?? '';
    const isExclusion =
      code === '23P01' ||
      msg.includes('bookings_tutor_no_overlap') ||
      msg.includes('exclusion constraint');

    if (isExclusion) {
      console.warn(
        `[stripe/webhook] EXCLUDE constraint hit on intent ${intent.id}; converting to slot-conflict refund`
      );
      const { data: refundPayment } = await admin
        .from('payments')
        .insert(refundCasePayload({ exclusion: true }))
        .select('id')
        .single();

      await notifySlotTaken();
      return { status: 'slot_conflict_needs_refund', paymentId: refundPayment?.id ?? null };
    }

    return { status: 'booking_insert_failed', paymentId: null };
  }

  const bookingId = (rpcResult as any).booking_id as string;
  const paymentId = (rpcResult as any).payment_id as string;

  // Provision meeting link (Google Meet / Zoom). Best-effort; a failure
  // here does NOT void the booking.
  try {
    await createSessionForBooking(bookingId);
  } catch (err) {
    console.error('[stripe/webhook] createSessionForBooking failed:', err);
  }

  // Best-effort fee capture for reconciliation (see handleIntentSucceeded).
  try {
    if (chargeId) {
      const stripe = getStripeClient();
      const charge = await stripe.charges.retrieve(chargeId, {
        expand: ['balance_transaction'],
      });
      const fees = extractChargeFees(charge);
      const variance =
        fees.feeTtd != null
          ? Math.round((processingFeeTtd - fees.feeTtd) * 100) / 100
          : null;

      await admin
        .from('payments')
        .update({
          stripe_balance_txn_id: fees.balanceTxnId,
          stripe_fee_ttd: fees.feeTtd,
          stripe_net_ttd: fees.netTtd,
          stripe_settlement_currency: fees.settlementCurrency,
          fee_variance_ttd: variance,
        })
        .eq('id', paymentId);

      if (variance != null && variance < 0) {
        console.warn(
          `[stripe/webhook] UNDER-COLLECTED on payment ${paymentId}: charged TT$${processingFeeTtd}, Stripe took TT$${fees.feeTtd} (variance TT$${variance}).`
        );
      }
    }
  } catch (feeError) {
    console.warn('[stripe/webhook] Could not capture balance_transaction fee:', feeError);
  }

  // Notify the payer (may be a parent for parent_required students). If the
  // payer isn't the student, notify the student too.
  const notifications: Array<Record<string, unknown>> = [
    {
      user_id: payerId,
      type: 'payment_succeeded',
      title: 'Booking confirmed',
      message: `Payment of $${priceTtd} TTD was successful and the session is booked.`,
      link: '/student/bookings',
      created_at: new Date().toISOString(),
    },
    {
      user_id: tutorId,
      type: 'booking_confirmed',
      title: 'New paid booking',
      message: `You have a new paid booking (${durationMinutes} minutes).`,
      link: '/tutor/sessions',
      created_at: new Date().toISOString(),
    },
  ];
  if (payerId !== studentId) {
    notifications.push({
      user_id: studentId,
      type: 'booking_confirmed',
      title: 'Your session is booked',
      message: `Your parent paid for a ${durationMinutes}-minute session — see you soon!`,
      link: '/student/bookings',
      created_at: new Date().toISOString(),
    });
  }
  await admin.from('notifications').insert(notifications);

  await sendReceiptEmail(admin, paymentId);

  return { status: 'created', paymentId, bookingId };
}

// -----------------------------------------------------------------
// payment_intent.payment_failed
// -----------------------------------------------------------------
async function handleIntentFailed(
  admin: AdminClient,
  event: Stripe.Event,
  attempts: number
) {
  const intent = event.data.object as Stripe.PaymentIntent;
  const { payment, retryable } = await findLocalPayment(
    admin,
    intent.id,
    intent.metadata?.payment_id
  );

  if (retryable) {
    await markRetryable(admin, event, null, attempts, 'lookup_retryable');
    return NextResponse.json(
      { received: false, status: 'lookup_retryable', retry: true },
      { status: 500 }
    );
  }

  if (!payment) {
    await markProcessed(admin, event, null, 'skipped', attempts, 'no local payment');
    return NextResponse.json({ received: true, status: 'no_payment' });
  }

  // Never walk back a payment that already succeeded — a failed
  // attempt can arrive out of order after a successful retry.
  if (payment.status === 'succeeded') {
    await markProcessed(admin, event, payment.id, 'skipped', attempts);
    return NextResponse.json({ received: true, status: 'already_succeeded' });
  }

  const failureMessage =
    intent.last_payment_error?.message ?? 'The payment was declined.';

  await admin
    .from('payments')
    .update({
      status: 'failed',
      cancel_reason: intent.last_payment_error?.code ?? 'payment_failed',
      raw_provider_payload: { event_id: event.id, intent },
    })
    .eq('id', payment.id);

  if (payment.booking_id) {
    await admin
      .from('bookings')
      .update({ payment_status: 'unpaid' })
      .eq('id', payment.booking_id);
  }

  await admin.from('notifications').insert({
    user_id: payment.payer_id,
    type: 'payment_failed',
    title: 'Payment failed',
    message: `Your payment of $${payment.amount_ttd} TTD did not go through. ${failureMessage}`,
    link: payment.booking_id
      ? `/payments/checkout?bookingId=${payment.booking_id}`
      : '/student/bookings',
    created_at: new Date().toISOString(),
  });

  await markProcessed(admin, event, payment.id, 'processed', attempts);
  return NextResponse.json({
    received: true,
    payment_id: payment.id,
    status: 'failed',
  });
}

// -----------------------------------------------------------------
// charge.refunded
// -----------------------------------------------------------------
async function handleChargeRefunded(
  admin: AdminClient,
  event: Stripe.Event,
  attempts: number
) {
  const charge = event.data.object as Stripe.Charge;
  const intentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;

  const { payment, retryable } = await findLocalPayment(
    admin,
    intentId,
    charge.metadata?.payment_id
  );

  if (retryable) {
    await markRetryable(admin, event, null, attempts, 'lookup_retryable');
    return NextResponse.json(
      { received: false, status: 'lookup_retryable', retry: true },
      { status: 500 }
    );
  }

  if (!payment) {
    await markProcessed(admin, event, null, 'skipped', attempts, 'no local payment');
    return NextResponse.json({ received: true, status: 'no_payment' });
  }

  const isFullRefund = charge.amount_refunded >= charge.amount;
  const newStatus = isFullRefund ? 'refunded' : 'partially_refunded';

  // If we initiated this refund via the admin refund route the payment
  // is already in a refunded state. Otherwise it's an out-of-band refund
  // (someone hit refund in the Stripe Dashboard) — flag it either way.
  const alreadyReflected =
    payment.status === 'refunded' || payment.status === 'partially_refunded';

  if (!alreadyReflected) {
    console.warn(
      `[stripe/webhook] Out-of-band refund detected on payment ${payment.id}; flagging for admin reconciliation`
    );
  }

  const refundFields: Record<string, unknown> = {
    status: newStatus,
    refunded_at: new Date().toISOString(),
    stripe_charge_id: charge.id,
    raw_provider_payload: { event_id: event.id, charge },
  };
  // Only stamp the out-of-band flag when it applies — an admin-initiated
  // refund already has its own cancel_reason we must not clobber.
  if (!alreadyReflected) {
    refundFields.cancel_reason = 'refunded_out_of_band';
  }

  await admin.from('payments').update(refundFields).eq('id', payment.id);

  if (payment.booking_id) {
    await admin
      .from('bookings')
      .update({ payment_status: 'refunded' })
      .eq('id', payment.booking_id);

    // Reverse the payout ledger row IF one exists. It only does when the
    // session was already charged (fn_create_earning_on_charge, mig 163);
    // for a refund before session completion there is nothing to reverse.
    // Released payouts are left alone — that money is already gone and
    // needs the manual clawback flow, not a silent status flip.
    const { data: sessionRow } = await admin
      .from('sessions')
      .select('id')
      .eq('booking_id', payment.booking_id)
      .maybeSingle();

    if (sessionRow?.id) {
      const { error: ledgerError } = await admin
        .from('payout_ledger')
        .update({
          status: 'reversed',
          updated_at: new Date().toISOString(),
        })
        .eq('session_id', sessionRow.id)
        .in('status', ['owed', 'release_ready']);

      if (ledgerError) {
        console.warn(
          '[stripe/webhook] Failed to reverse payout_ledger:',
          ledgerError
        );
      }
    }
  }

  const refundedTtd = centsToTtd(charge.amount_refunded);
  await admin.from('notifications').insert({
    user_id: payment.payer_id,
    type: 'payment_refunded',
    title: isFullRefund ? 'Refund issued' : 'Partial refund issued',
    message: `A refund of $${refundedTtd} TTD has been issued to your original payment method. It may take 5–10 business days to appear.`,
    link: '/student/bookings',
    created_at: new Date().toISOString(),
  });

  await markProcessed(admin, event, payment.id, 'processed', attempts);
  return NextResponse.json({
    received: true,
    payment_id: payment.id,
    status: newStatus,
  });
}

// -----------------------------------------------------------------
// charge.updated — late fee backfill
// -----------------------------------------------------------------
/**
 * Captures Stripe's real processing fee once the balance transaction
 * has settled.
 *
 * WHY THIS EXISTS: `balance_transaction` is frequently NOT yet available
 * when `payment_intent.succeeded` fires — the charge exists but Stripe
 * hasn't settled it. The inline capture in handleIntentSucceeded is
 * therefore best-effort and often produces null fees in production
 * (observed on a deployed test: fees captured locally where the handler
 * was slow, null on the fast serverless path).
 *
 * Polling inside the succeeded handler would add latency to a webhook
 * that should ack fast, so instead we backfill here. Stripe emits
 * charge.updated when the balance transaction lands.
 *
 * Purely a reconciliation concern — it never changes payment or booking
 * status, and a miss costs nothing but an empty fee_variance_ttd.
 */
async function handleChargeUpdated(
  admin: AdminClient,
  event: Stripe.Event,
  attempts: number
) {
  const charge = event.data.object as Stripe.Charge;
  const intentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;

  if (!intentId) {
    await markProcessed(admin, event, null, 'skipped', attempts, 'no payment_intent');
    return NextResponse.json({ received: true, status: 'no_intent' });
  }

  const { data: payment } = await admin
    .from('payments')
    .select('id, charged_processing_fee_ttd, stripe_fee_ttd')
    .eq('stripe_payment_intent_id', intentId)
    .maybeSingle();

  // Nothing of ours, or the fee is already recorded — nothing to do.
  if (!payment || payment.stripe_fee_ttd != null) {
    await markProcessed(admin, event, payment?.id ?? null, 'skipped', attempts);
    return NextResponse.json({ received: true, status: 'no_backfill_needed' });
  }

  // The charge on a WEBHOOK PAYLOAD carries balance_transaction as an id
  // string, never an expanded object — so extractChargeFees would always
  // return nulls here. Re-retrieve with the expansion to get the real
  // figures. (This is what made the first version of this handler no-op.)
  let fees = extractChargeFees(charge);
  if (fees.feeTtd == null) {
    try {
      const stripe = getStripeClient();
      const full = await stripe.charges.retrieve(charge.id, {
        expand: ['balance_transaction'],
      });
      fees = extractChargeFees(full);
    } catch (err) {
      console.warn('[stripe/webhook] Could not re-retrieve charge for fees:', err);
    }
  }

  if (fees.feeTtd == null) {
    // Genuinely not settled yet — a later charge.updated will pick it up.
    await markProcessed(admin, event, payment.id, 'skipped', attempts, 'fee not settled yet');
    return NextResponse.json({ received: true, status: 'fee_not_ready' });
  }

  const charged = payment.charged_processing_fee_ttd;
  const variance =
    charged != null
      ? Math.round((Number(charged) - fees.feeTtd) * 100) / 100
      : null;

  await admin
    .from('payments')
    .update({
      stripe_charge_id: charge.id,
      stripe_balance_txn_id: fees.balanceTxnId,
      stripe_fee_ttd: fees.feeTtd,
      stripe_net_ttd: fees.netTtd,
      stripe_settlement_currency: fees.settlementCurrency,
      fee_variance_ttd: variance,
    })
    .eq('id', payment.id);

  if (variance != null && variance < 0) {
    console.warn(
      `[stripe/webhook] UNDER-COLLECTED on payment ${payment.id}: charged TT$${charged}, Stripe took TT$${fees.feeTtd} (variance TT$${variance}).`
    );
  }

  console.log(
    `[stripe/webhook] Backfilled fee for payment ${payment.id}: TT$${fees.feeTtd} (variance TT$${variance})`
  );

  await markProcessed(admin, event, payment.id, 'processed', attempts);
  return NextResponse.json({
    received: true,
    payment_id: payment.id,
    status: 'fee_backfilled',
  });
}

// -----------------------------------------------------------------
// charge.dispute.created
// -----------------------------------------------------------------
async function handleDisputeCreated(
  admin: AdminClient,
  event: Stripe.Event,
  attempts: number
) {
  const dispute = event.data.object as Stripe.Dispute;
  const chargeId =
    typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

  // Resolve the payment via the charge's PaymentIntent.
  let intentId: string | null = null;
  try {
    if (chargeId) {
      const stripe = getStripeClient();
      const charge = await stripe.charges.retrieve(chargeId);
      intentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;
    }
  } catch (err) {
    console.warn('[stripe/webhook] Could not retrieve disputed charge:', err);
  }

  const { payment, retryable } = await findLocalPayment(
    admin,
    intentId,
    dispute.metadata?.payment_id
  );

  if (retryable) {
    await markRetryable(admin, event, null, attempts, 'lookup_retryable');
    return NextResponse.json(
      { received: false, status: 'lookup_retryable', retry: true },
      { status: 500 }
    );
  }

  if (!payment) {
    console.error(
      `[stripe/webhook] Dispute ${dispute.id} could not be matched to a local payment`
    );
    await markProcessed(admin, event, null, 'skipped', attempts, 'no local payment');
    return NextResponse.json({ received: true, status: 'no_payment' });
  }

  await admin
    .from('payments')
    .update({ cancel_reason: 'dispute_created' })
    .eq('id', payment.id);

  // There is no standalone `disputes` table in this schema — chargebacks
  // are modelled as a payout hold case (migration 168), which is what the
  // admin dispute queue already reads from.
  if (payment.booking_id) {
    const { data: bookingRow } = await admin
      .from('bookings')
      .select('tutor_id')
      .eq('id', payment.booking_id)
      .single();

    if (bookingRow?.tutor_id) {
      const { error: caseError } = await admin.from('payout_cases').insert({
        booking_id: payment.booking_id,
        payment_id: payment.id,
        tutor_id: bookingRow.tutor_id,
        claimant_id: payment.payer_id,
        hold_reason: 'chargeback',
        status: 'open',
        refund_amount_ttd: centsToTtd(dispute.amount),
        admin_notes: `Stripe dispute ${dispute.id} (${dispute.reason}). Evidence due ${
          dispute.evidence_details?.due_by
            ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
            : 'unknown'
        }.`,
      });

      if (caseError) {
        // Transient DB failure — leave retryable rather than silently
        // losing the chargeback record.
        console.error(
          '[stripe/webhook] Failed to open payout case for dispute:',
          caseError
        );
        await markRetryable(
          admin,
          event,
          payment.id,
          attempts,
          `payout_case_insert_failed: ${caseError.message}`
        );
        return NextResponse.json(
          { received: false, status: 'payout_case_failed', retry: true },
          { status: 500 }
        );
      }
    }
  }

  console.warn(
    `[stripe/webhook] Dispute ${dispute.id} opened on payment ${payment.id} — response required`
  );

  await markProcessed(admin, event, payment.id, 'processed', attempts);
  return NextResponse.json({
    received: true,
    payment_id: payment.id,
    status: 'dispute_recorded',
  });
}
