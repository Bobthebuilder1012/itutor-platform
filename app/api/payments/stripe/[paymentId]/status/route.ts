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

    const { data: payment, error } = await userClient
      .from('payments')
      .select('id, booking_id, payer_id, status, amount_ttd, paid_at')
      .eq('id', paymentId)
      .maybeSingle();

    if (error || !payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Only the payer may poll their own payment.
    if (payment.payer_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
