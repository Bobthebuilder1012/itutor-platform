// =====================================================
// STRIPE PAYMENT STATUS
// =====================================================
// GET /api/payments/stripe/[paymentId]/status
//
// Read-only. Lets the checkout UI wait for the webhook to land
// instead of trusting the client-side confirmPayment result.
//
// Reports OUR database state, not Stripe's. If the webhook hasn't
// been processed yet this correctly still says 'requires_action' —
// that's the point.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId } = await params;

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

    // Accepts either our payments.id (pay-for-existing-booking flow) or a
    // Stripe PaymentIntent id (pay-first "create_booking" flow, where no
    // payments row exists until the webhook materialises the booking).
    const isIntentId = paymentId.startsWith('pi_');

    const query = userClient
      .from('payments')
      .select('id, booking_id, payer_id, status, amount_ttd, paid_at');

    const { data: payment, error } = await (isIntentId
      ? query.eq('stripe_payment_intent_id', paymentId)
      : query.eq('id', paymentId)
    ).maybeSingle();

    if (!payment && isIntentId) {
      // Group subscriptions don't write to `payments` at all — they use
      // subscription_payments, and the enrollment is what actually flips to
      // ACTIVE. Without this the checkout page would poll forever and time
      // out on a subscription that had in fact been paid.
      const { data: subPayment } = await userClient
        .from('subscription_payments')
        .select('id, status, enrollment_id, group_id, paid_at')
        .eq('stripe_payment_intent_id', paymentId)
        .maybeSingle();

      if (subPayment) {
        const { data: enrollment } = await userClient
          .from('group_enrollments')
          .select('status')
          .eq('id', subPayment.enrollment_id)
          .maybeSingle();

        const active =
          subPayment.status === 'paid' ||
          subPayment.status === 'succeeded' ||
          enrollment?.status === 'ACTIVE';

        return NextResponse.json({
          paymentId: subPayment.id,
          kind: 'group_subscription',
          groupId: subPayment.group_id,
          enrollmentId: subPayment.enrollment_id,
          // 'succeeded' is what the client polls for, so map onto it rather
          // than leaking subscription-specific status names to the UI.
          status: active ? 'succeeded' : 'pending',
          enrollmentStatus: enrollment?.status ?? null,
          paidAt: subPayment.paid_at ?? null,
        });
      }

      // Expected while the webhook is still in flight — the booking and its
      // payment row are created together on payment_intent.succeeded. Report
      // 'pending' so the client keeps waiting rather than treating it as an
      // error, which would be indistinguishable from a genuine failure.
      return NextResponse.json({ paymentId, status: 'pending' });
    }

    if (error || !payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Authorization is enforced by RLS on the query above, which is run with
    // the *user's* client, not the service role. If a row came back, this
    // user is already permitted to see it — the policies on `payments` cover
    // the payer, the student, a linked parent, and the tutor.
    //
    // Do NOT re-check payer_id === user.id here. That was stricter than the
    // policies and broke billing_mode='parent_required': the student sits on
    // the checkout page while their PARENT is the payer, so the student's own
    // poll 403'd, the client kept retrying, and a perfectly successful
    // payment surfaced as "still being confirmed" until it timed out.

    let bookingPaymentStatus: string | null = null;
    if (payment.booking_id) {
      const { data: booking } = await userClient
        .from('bookings')
        .select('payment_status')
        .eq('id', payment.booking_id)
        .maybeSingle();
      bookingPaymentStatus = booking?.payment_status ?? null;
    }

    return NextResponse.json({
      paymentId: payment.id,
      bookingId: payment.booking_id,
      status: payment.status,
      bookingPaymentStatus,
      amount: payment.amount_ttd,
      paidAt: payment.paid_at,
    });
  } catch (err) {
    console.error('[stripe/status] Unhandled error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
