// =====================================================
// LUNIPAY CHECKOUT INITIATION
// =====================================================
// POST /api/payments/lunipay/initiate
// Body: { bookingId: string }
//
// 1. Verifies the authenticated user is the booking's payer.
// 2. Creates a `payments` row (status='initiated').
// 3. Creates a LuniPay checkout session.
// 4. Stores the session id + hosted URL on the payments row.
// 5. Returns { paymentId, paymentUrl } for the client to redirect.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { LuniPayError } from 'lunipay';
import { getLunipayClient, ttdToCents } from '@/lib/payments/lunipayClient';
import { calculateGrossAmount } from '@/lib/payments/grossUp';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';
import { paidClassesForbiddenResponse } from '@/lib/featureFlags/http';
import { calculateCommissionForTutor } from '@/lib/utils/commissionCalculator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ReusablePayment = {
  id: string;
  lunipay_checkout_url: string;
};

/**
 * Returns the newest open checkout-session payment for this
 * booking, but only if it has a hosted URL and its LuniPay
 * `expires_at` is still in the future. Anything stale or
 * URL-less is treated as not reusable so we create a fresh one.
 *
 * Stale rows are also marked cancelled so the partial unique
 * index on (booking_id) WHERE status IN ('initiated','requires_action')
 * stops blocking subsequent inserts.
 */
// Use the permissive (any-Database) SupabaseClient so .update() / .insert()
// accept arbitrary column shapes — we don't generate Database types in this
// project, so the strict default in @supabase/supabase-js >=2.89 narrows the
// parameter to `never`.
type AdminClient = SupabaseClient<any, 'public', 'public', any, any>;

async function findReusableActivePayment(
  admin: AdminClient,
  bookingId: string
): Promise<ReusablePayment | null> {
  const { data: rows } = await admin
    .from('payments')
    .select('id, lunipay_checkout_url, expires_at, status')
    .eq('booking_id', bookingId)
    .in('status', ['initiated', 'requires_action'])
    .order('created_at', { ascending: false })
    .limit(5);

  if (!rows || rows.length === 0) return null;

  const now = Date.now();
  let reusable: ReusablePayment | null = null;
  const staleIds: string[] = [];

  for (const row of rows as Array<{
    id: string;
    lunipay_checkout_url: string | null;
    expires_at: string | null;
    status: string;
  }>) {
    const hasUrl = !!row.lunipay_checkout_url;
    const notExpired =
      !row.expires_at || new Date(row.expires_at).getTime() > now;

    if (!reusable && hasUrl && notExpired) {
      reusable = { id: row.id, lunipay_checkout_url: row.lunipay_checkout_url! };
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
        cancel_reason: 'session_expired_replaced',
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      console.error('[lunipay/initiate] NEXT_PUBLIC_APP_URL is not configured');
      return NextResponse.json(
        { error: 'Payments are not configured' },
        { status: 500 }
      );
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
        'id, payer_id, tutor_id, status, price_ttd, currency, duration_minutes, payment_status, payment_required, subjects(name, label)'
      )
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    if (booking.payer_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to pay for this booking' },
        { status: 403 }
      );
    }

    // Reject terminal-state bookings before doing any LuniPay work.
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

    const commission = await calculateCommissionForTutor(admin, booking.tutor_id, priceTtd);
    const { grossAmount, processingFee } = calculateGrossAmount(priceTtd);
    const amountCents = ttdToCents(grossAmount);

    // -----------------------------------------------------------
    // Idempotency: if there is already an open checkout session
    // for this booking that hasn't expired, return its URL instead
    // of creating a second payment row. This handles the common
    // double-click case in a single round-trip.
    // -----------------------------------------------------------
    const reusable = await findReusableActivePayment(admin, bookingId);
    if (reusable) {
      return NextResponse.json({
        success: true,
        paymentId: reusable.id,
        paymentUrl: reusable.lunipay_checkout_url,
        amount: priceTtd,
        currency: 'TTD',
        reused: true,
      });
    }

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        booking_id: bookingId,
        payer_id: user.id,
        provider: 'lunipay',
        amount_ttd: priceTtd,
        status: 'initiated',
      })
      .select('id')
      .single();

    if (paymentError || !payment) {
      // Postgres unique_violation — another concurrent request
      // beat us to the partial unique index from migration 135.
      // Look up the row that won and reuse its URL.
      if (
        paymentError &&
        (paymentError as { code?: string }).code === '23505'
      ) {
        const winner = await findReusableActivePayment(admin, bookingId);
        if (winner) {
          return NextResponse.json({
            success: true,
            paymentId: winner.id,
            paymentUrl: winner.lunipay_checkout_url,
            amount: priceTtd,
            currency: 'TTD',
            reused: true,
          });
        }
      }

      console.error('[lunipay/initiate] Failed to create payment row:', paymentError);
      return NextResponse.json(
        { error: 'Failed to create payment record' },
        { status: 500 }
      );
    }

    const subjectLabel =
      (booking as { subjects?: { label?: string; name?: string } }).subjects?.label ||
      (booking as { subjects?: { label?: string; name?: string } }).subjects?.name ||
      'Tutoring Session';

    const description = `${subjectLabel} (${booking.duration_minutes} min)`;
    const successUrl = `${appUrl}/payments/success?bookingId=${bookingId}&paymentId=${payment.id}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/payments/checkout?bookingId=${bookingId}&cancelled=1`;

    try {
      const lunipay = getLunipayClient();
      const session = await lunipay.checkout.sessions.create(
        {
          amount: amountCents,
          currency: 'ttd',
          success_url: successUrl,
          cancel_url: cancelUrl,
          customer_email: customerEmail,
          // The SDK's `CheckoutSessionLineItem` type calls this field
          // `amount_cents`, but the live API actually expects `amount`
          // (in cents) — see scripts/test-lunipay-sandbox.ts. Cast through
          // `any` so the SDK accepts the shape the real endpoint wants.
          line_items: [
            {
              name: description,
              quantity: 1,
              amount: amountCents,
            } as any,
          ],
          metadata: {
            booking_id: bookingId,
            payment_id: payment.id,
            payer_id: user.id,
            base_amount_ttd: String(priceTtd),
            processing_fee_ttd: String(processingFee),
          },
        },
        { idempotencyKey: `init-${payment.id}` }
      );

      await admin
        .from('payments')
        .update({
          status: 'requires_action',
          provider_reference: session.id,
          lunipay_checkout_session_id: session.id,
          lunipay_payment_intent_id: session.payment_intent_id,
          lunipay_checkout_url: session.url,
          expires_at: new Date(session.expires_at * 1000).toISOString(),
          raw_provider_payload: session,
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
        paymentId: payment.id,
        paymentUrl: session.url,
        sessionId: session.id,
        amount: priceTtd,
        currency: 'TTD',
      });
    } catch (sdkError) {
      const isApiError = sdkError instanceof LuniPayError;
      console.error(
        '[lunipay/initiate] sessions.create failed:',
        isApiError
          ? { code: sdkError.code, status: sdkError.status, message: sdkError.message }
          : sdkError
      );

      await admin
        .from('payments')
        .update({
          status: 'failed',
          raw_provider_payload: isApiError
            ? { code: sdkError.code, message: sdkError.message, status: sdkError.status }
            : { error: (sdkError as Error).message },
        })
        .eq('id', payment.id);

      return NextResponse.json(
        {
          error: 'Failed to create LuniPay checkout session',
          details: isApiError ? sdkError.message : (sdkError as Error).message,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('[lunipay/initiate] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
