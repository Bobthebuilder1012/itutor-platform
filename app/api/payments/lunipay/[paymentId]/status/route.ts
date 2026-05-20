// =====================================================
// LUNIPAY PAYMENT STATUS POLL
// =====================================================
// GET /api/payments/lunipay/[paymentId]/status
//
// The frontend polls this while the student is on the LuniPay
// checkout. If our local status is still pending and we have a
// LuniPay session id, we re-verify against LuniPay.
//
// Access: the booking's payer or tutor.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  getLunipayClient,
  mapCheckoutSessionToDbStatus,
} from '@/lib/payments/lunipayClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
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

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select(
        'id, booking_id, payer_id, amount_ttd, status, paid_at, expires_at, lunipay_checkout_session_id, created_at, bookings(tutor_id, currency)'
      )
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    const booking = (payment as { bookings?: { tutor_id?: string; currency?: string } })
      .bookings;
    const tutorId = booking?.tutor_id;

    if (payment.payer_id !== user.id && tutorId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let currentStatus = payment.status as string;
    let paidAt = payment.paid_at as string | null;

    // If still pending and we have a LuniPay handle, re-verify.
    if (
      (currentStatus === 'initiated' || currentStatus === 'requires_action') &&
      payment.lunipay_checkout_session_id
    ) {
      try {
        const lunipay = getLunipayClient();
        const session = await lunipay.checkout.sessions.retrieve(
          payment.lunipay_checkout_session_id
        );
        const mapped = mapCheckoutSessionToDbStatus(session);

        if (mapped !== currentStatus) {
          const update: Record<string, unknown> = {
            status: mapped,
            raw_provider_payload: { polled: session },
          };

          if (mapped === 'succeeded') {
            update.paid_at = new Date().toISOString();
            update.lunipay_payment_id = session.payment_id;
            update.lunipay_payment_intent_id = session.payment_intent_id;
            paidAt = update.paid_at as string;
          } else if (mapped === 'cancelled') {
            update.cancelled_at = new Date().toISOString();
            update.cancel_reason = 'session_expired';
          }

          await admin.from('payments').update(update).eq('id', payment.id);

          if (mapped === 'succeeded') {
            const { error: rpcError } = await admin.rpc('complete_booking_payment', {
              p_booking_id: payment.booking_id,
              p_payment_id: payment.id,
              p_provider_reference: payment.lunipay_checkout_session_id,
            });
            if (rpcError) {
              console.warn(
                '[lunipay/status] complete_booking_payment RPC failed:',
                rpcError
              );
            }
          }

          currentStatus = mapped;
        }
      } catch (err) {
        console.warn('[lunipay/status] LuniPay retrieve failed:', err);
      }
    }

    return NextResponse.json({
      payment_id: payment.id,
      booking_id: payment.booking_id,
      amount: payment.amount_ttd,
      currency: booking?.currency || 'TTD',
      status: currentStatus,
      paid_at: paidAt,
      expires_at: payment.expires_at,
      created_at: payment.created_at,
    });
  } catch (error) {
    console.error('[lunipay/status] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
