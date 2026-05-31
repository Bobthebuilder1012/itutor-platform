// =====================================================
// LUNIPAY PAYMENT CANCEL
// =====================================================
// POST /api/payments/lunipay/[paymentId]/cancel
// Body: { reason?: string }
//
// Expires a pending checkout session via the LuniPay SDK.
// LuniPay has no "cancel" verb — `POST /v1/checkout/sessions/:id/expire`
// is the documented way to abort an OPEN session, transitioning
// it to EXPIRED.
//
// Best-effort against LuniPay: if the SDK call fails (e.g. the
// session already expired), we still mark the local record
// cancelled so the booking can be retried.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { LuniPayError } from 'lunipay';
import { getLunipayClient } from '@/lib/payments/lunipayClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId } = await params;
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason || 'user_cancelled';

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

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select('id, booking_id, payer_id, status, lunipay_checkout_session_id')
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    if (payment.payer_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (payment.status !== 'initiated' && payment.status !== 'requires_action') {
      return NextResponse.json(
        { error: `Cannot cancel a payment with status: ${payment.status}` },
        { status: 400 }
      );
    }

    let expiredSessionPayload: unknown = null;
    if (payment.lunipay_checkout_session_id) {
      try {
        const lunipay = getLunipayClient();
        expiredSessionPayload = await lunipay.checkout.sessions.expire(
          payment.lunipay_checkout_session_id
        );
      } catch (err) {
        const isApiError = err instanceof LuniPayError;
        console.warn(
          '[lunipay/cancel] sessions.expire failed:',
          isApiError
            ? { code: err.code, status: err.status, message: err.message }
            : err
        );
      }
    }

    await admin
      .from('payments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason,
        raw_provider_payload: { expire: expiredSessionPayload },
      })
      .eq('id', payment.id);

    // Reset booking so the student can retry payment.
    await admin
      .from('bookings')
      .update({ payment_status: 'unpaid' })
      .eq('id', payment.booking_id);

    return NextResponse.json({
      payment_id: payment.id,
      status: 'cancelled',
      message: 'Payment has been cancelled',
    });
  } catch (error) {
    console.error('[lunipay/cancel] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
