// =====================================================
// STRIPE PAYMENT INTENT INITIATION
// =====================================================
// POST /api/payments/stripe/initiate
// Body: { bookingId: string }
//
// 1. Verifies the authenticated user is the booking's payer.
// 2. Creates a `payments` row (status='initiated').
// 3. Creates a Stripe PaymentIntent for the grossed-up amount.
// 4. Stores the PaymentIntent id on the payments row.
// 5. Returns { bookingId, paymentId, clientSecret } for the
//    Payment Element to confirm against.
//
// The price is ALWAYS recomputed server-side from bookings.price_ttd
// (itself derived from tutor_subjects.price_per_hour_ttd by the
// booking RPCs). No client-submitted amount is ever trusted.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import Stripe from 'stripe';
import { getStripeClient, ttdToCents } from '@/lib/payments/stripeClient';
import { calculateGrossAmountForProvider } from '@/lib/payments/grossUp';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';
import { paidClassesForbiddenResponse } from '@/lib/featureFlags/http';
import { calculateCommissionForTutor } from '@/lib/utils/commissionCalculator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Use the permissive (any-Database) SupabaseClient so .update() / .insert()
// accept arbitrary column shapes — we don't generate Database types in this
// project, so the strict default in @supabase/supabase-js >=2.89 narrows the
// parameter to `never`.
type AdminClient = SupabaseClient<any, 'public', 'public', any, any>;

type ReusablePayment = {
  id: string;
  stripe_payment_intent_id: string;
};

/**
 * Returns the newest open PaymentIntent-backed payment row for this
 * booking. Unlike LuniPay checkout sessions, PaymentIntents don't
 * expire on a short clock — they stay confirmable until cancelled —
 * so any open row with a PI id is reusable.
 *
 * Rows without a PI id (the provider call failed before we stored one)
 * are marked cancelled so the partial unique index from migration 135
 * on (booking_id) WHERE status IN ('initiated','requires_action')
 * stops blocking subsequent inserts.
 */
async function findReusableActivePayment(
  admin: AdminClient,
  bookingId: string
): Promise<ReusablePayment | null> {
  const { data: rows } = await admin
    .from('payments')
    .select('id, stripe_payment_intent_id, status')
    .eq('booking_id', bookingId)
    .eq('provider', 'stripe')
    .in('status', ['initiated', 'requires_action'])
    .order('created_at', { ascending: false })
    .limit(5);

  if (!rows || rows.length === 0) return null;

  let reusable: ReusablePayment | null = null;
  const staleIds: string[] = [];

  for (const row of rows as Array<{
    id: string;
    stripe_payment_intent_id: string | null;
    status: string;
  }>) {
    if (!reusable && row.stripe_payment_intent_id) {
      reusable = {
        id: row.id,
        stripe_payment_intent_id: row.stripe_payment_intent_id,
      };
    } else {
      staleIds.push(row.id);
    }
  }

  if (staleIds.length > 0) {
    await admin
      .from('payments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: 'intent_replaced',
      })
      .in('id', staleIds);
  }

  return reusable;
}

export async function POST(request: NextRequest) {
  try {
    if (!isPaidClassesEnabled()) {
      return paidClassesForbiddenResponse();
    }

    const { bookingId } = (await request.json()) as { bookingId?: string };
    if (!bookingId) {
      return NextResponse.json(
        { error: 'bookingId is required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: booking, error: bookingError } = await userClient
      .from('bookings')
      .select(
        'id, payer_id, student_id, tutor_id, status, price_ttd, currency, duration_minutes, payment_status, payment_required, subjects(name, label)'
      )
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.payer_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to pay for this booking' },
        { status: 403 }
      );
    }

    // Reject terminal-state bookings before doing any Stripe work.
    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      return NextResponse.json(
        {
          error: `Cannot initiate payment for a ${String(booking.status).toLowerCase()} booking`,
          bookingStatus: booking.status,
        },
        { status: 409 }
      );
    }

    if (booking.payment_status === 'paid') {
      return NextResponse.json(
        { error: 'Booking is already paid' },
        { status: 400 }
      );
    }

    if (booking.payment_required === false) {
      return NextResponse.json(
        { error: 'Payment is not required for this booking' },
        { status: 400 }
      );
    }

    const priceTtd = Number(booking.price_ttd);
    if (!Number.isFinite(priceTtd) || priceTtd <= 0) {
      return NextResponse.json(
        { error: 'Booking has an invalid price' },
        { status: 400 }
      );
    }

    const { data: profile } = await userClient
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single();

    const customerEmail = profile?.email || user.email;
    if (!customerEmail) {
      return NextResponse.json(
        { error: 'Your profile is missing an email address' },
        { status: 400 }
      );
    }

    // Service-role client for the payments row write (RLS bypass).
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const commission = await calculateCommissionForTutor(
      admin,
      booking.tutor_id,
      priceTtd
    );
    const { grossAmount, processingFee } = calculateGrossAmountForProvider(
      priceTtd,
      'stripe'
    );
    const amountCents = ttdToCents(grossAmount);

    const stripe = getStripeClient();

    // -----------------------------------------------------------
    // Idempotency: if there is already an open PaymentIntent for
    // this booking, hand back its client secret instead of creating
    // a second one. Handles the common double-click case.
    // -----------------------------------------------------------
    const reusable = await findReusableActivePayment(admin, bookingId);
    if (reusable) {
      try {
        const existingIntent = await stripe.paymentIntents.retrieve(
          reusable.stripe_payment_intent_id
        );

        // Only reuse if it's still confirmable AND still for the same
        // amount — a price change between attempts must mint a new one.
        const stillOpen =
          existingIntent.status !== 'succeeded' &&
          existingIntent.status !== 'canceled';

        if (stillOpen && existingIntent.amount === amountCents) {
          return NextResponse.json({
            success: true,
            bookingId,
            paymentId: reusable.id,
            clientSecret: existingIntent.client_secret,
            amount: priceTtd,
            processingFee,
            total: grossAmount,
            currency: 'TTD',
            reused: true,
          });
        }

        // Not reusable — cancel it so we don't leave a live intent
        // dangling, then fall through and create a fresh one.
        if (stillOpen) {
          await stripe.paymentIntents.cancel(reusable.stripe_payment_intent_id);
        }
        await admin
          .from('payments')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: 'intent_amount_changed',
          })
          .eq('id', reusable.id);
      } catch (retrieveError) {
        console.warn(
          '[stripe/initiate] Could not retrieve existing intent; creating a new one:',
          retrieveError
        );
        await admin
          .from('payments')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: 'intent_unretrievable',
          })
          .eq('id', reusable.id);
      }
    }

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        booking_id: bookingId,
        payer_id: user.id,
        provider: 'stripe',
        amount_ttd: priceTtd,
        status: 'initiated',
      })
      .select('id')
      .single();

    if (paymentError || !payment) {
      // Postgres unique_violation — another concurrent request beat us
      // to the partial unique index from migration 135. Look up the row
      // that won and reuse its intent.
      if (paymentError && (paymentError as { code?: string }).code === '23505') {
        const winner = await findReusableActivePayment(admin, bookingId);
        if (winner) {
          try {
            const winnerIntent = await stripe.paymentIntents.retrieve(
              winner.stripe_payment_intent_id
            );
            return NextResponse.json({
              success: true,
              bookingId,
              paymentId: winner.id,
              clientSecret: winnerIntent.client_secret,
              amount: priceTtd,
              processingFee,
              total: grossAmount,
              currency: 'TTD',
              reused: true,
            });
          } catch {
            /* fall through to the generic error below */
          }
        }
      }

      console.error(
        '[stripe/initiate] Failed to create payment row:',
        paymentError
      );
      return NextResponse.json(
        { error: 'Failed to create payment record' },
        { status: 500 }
      );
    }

    const subjectLabel =
      (booking as { subjects?: { label?: string; name?: string } }).subjects
        ?.label ||
      (booking as { subjects?: { label?: string; name?: string } }).subjects
        ?.name ||
      'Tutoring Session';

    const description = `${subjectLabel} (${booking.duration_minutes} min)`;

    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: 'ttd',
          description,
          receipt_email: customerEmail,
          automatic_payment_methods: { enabled: true },
          metadata: {
            booking_id: bookingId,
            payment_id: payment.id,
            payer_id: user.id,
            student_id: booking.student_id,
            tutor_id: booking.tutor_id,
            base_amount_ttd: String(priceTtd),
            processing_fee_ttd: String(processingFee),
          },
        },
        // Keyed on the payment row id, not the booking id. A booking-keyed
        // key would replay a stale intent when a student retries after a
        // genuine failure (or throw on changed params), whereas each retry
        // legitimately gets its own payments row.
        { idempotencyKey: `pi-${payment.id}` }
      );

      await admin
        .from('payments')
        .update({
          status: 'requires_action',
          provider_reference: intent.id,
          stripe_payment_intent_id: intent.id,
          // Recorded so the webhook can compare it against Stripe's
          // actual fee and surface over/under-collection.
          charged_processing_fee_ttd: processingFee,
          raw_provider_payload: intent,
        })
        .eq('id', payment.id);

      await admin
        .from('bookings')
        .update({
          payment_status: 'pending',
          platform_fee_pct: Math.round(commission.commissionRate * 100),
          platform_fee_ttd: commission.platformFee,
          tutor_payout_ttd: commission.payoutAmount,
        })
        .eq('id', bookingId);

      return NextResponse.json({
        success: true,
        bookingId,
        paymentId: payment.id,
        clientSecret: intent.client_secret,
        amount: priceTtd,
        processingFee,
        total: grossAmount,
        currency: 'TTD',
      });
    } catch (sdkError) {
      const isApiError = sdkError instanceof Stripe.errors.StripeError;
      console.error(
        '[stripe/initiate] paymentIntents.create failed:',
        isApiError
          ? {
              type: sdkError.type,
              code: sdkError.code,
              message: sdkError.message,
            }
          : sdkError
      );

      // Mark the orphaned payment row failed so the partial unique index
      // doesn't block the student's next attempt. This is the reason the
      // booking is never left dangling: the booking row's lifecycle is
      // independent of the payment attempt.
      await admin
        .from('payments')
        .update({
          status: 'failed',
          cancel_reason: 'intent_create_failed',
          raw_provider_payload: isApiError
            ? {
                type: sdkError.type,
                code: sdkError.code,
                message: sdkError.message,
              }
            : { error: (sdkError as Error).message },
        })
        .eq('id', payment.id);

      await admin
        .from('bookings')
        .update({ payment_status: 'unpaid' })
        .eq('id', bookingId);

      return NextResponse.json(
        {
          error: 'Failed to create Stripe payment',
          details: isApiError
            ? sdkError.message
            : (sdkError as Error).message,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('[stripe/initiate] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
