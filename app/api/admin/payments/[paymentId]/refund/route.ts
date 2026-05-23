// =====================================================
// ADMIN REFUND PAYMENT
// =====================================================
// POST /api/admin/payments/:paymentId/refund
// Body: { amount_ttd?: number, reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer' }
//
// Triggers a refund through LuniPay's API and reflects it locally.
// - amount_ttd omitted → full refund (LuniPay default)
// - reason omitted → 'requested_by_customer'
//
// Idempotent on already-refunded payments (no-ops with current state).
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { getLunipayClient, ttdToCents } from '@/lib/payments/lunipayClient';
import { LuniPayError } from 'lunipay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_REASONS = new Set([
  'duplicate',
  'fraudulent',
  'requested_by_customer',
]);

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const requestedAmount = body?.amount_ttd != null ? Number(body.amount_ttd) : undefined;
  const reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' =
    ALLOWED_REASONS.has(body?.reason)
      ? body.reason
      : 'requested_by_customer';

  if (requestedAmount !== undefined && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
    return NextResponse.json(
      { error: 'amount_ttd must be a positive number when provided' },
      { status: 400 }
    );
  }

  const admin = getServiceClient();

  const { data: payment, error: lookupError } = await admin
    .from('payments')
    .select('id, status, amount_ttd, payer_id, lunipay_payment_id, raw_provider_payload')
    .eq('id', params.paymentId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  if (payment.status === 'refunded') {
    return NextResponse.json({
      ok: true,
      status: 'already_refunded',
      payment_id: payment.id,
    });
  }

  if (payment.status !== 'succeeded') {
    return NextResponse.json(
      { error: `Cannot refund a payment in status '${payment.status}'` },
      { status: 400 }
    );
  }

  if (!payment.lunipay_payment_id) {
    return NextResponse.json(
      { error: 'Payment has no LuniPay payment id (was it ever captured?)' },
      { status: 400 }
    );
  }

  const refundAmountCents =
    requestedAmount !== undefined ? ttdToCents(requestedAmount) : undefined;
  const refundAmountTtd =
    requestedAmount !== undefined ? requestedAmount : Number(payment.amount_ttd ?? 0);

  let refund;
  try {
    const lunipay = getLunipayClient();
    refund = await lunipay.payments.refund(
      payment.lunipay_payment_id,
      {
        amount: refundAmountCents,
        reason,
        metadata: {
          internal_payment_id: payment.id,
          refunded_by: auth.user!.id,
        },
      } as any,
      { idempotencyKey: `refund-${payment.id}` }
    );
  } catch (err) {
    const isApiError = err instanceof LuniPayError;
    console.error('[admin/refund] LuniPay refund failed:', err);
    return NextResponse.json(
      {
        error: 'LuniPay refund failed',
        details: isApiError ? err.message : (err as Error).message,
        code: isApiError ? err.code : undefined,
      },
      { status: 502 }
    );
  }

  const isFullRefund =
    requestedAmount === undefined ||
    Math.abs(refundAmountTtd - Number(payment.amount_ttd ?? 0)) < 0.005;

  const newStatus = isFullRefund && refund.status === 'SUCCEEDED'
    ? 'refunded'
    : payment.status; // keep 'succeeded' for partial / pending refunds

  const existingPayload =
    payment.raw_provider_payload && typeof payment.raw_provider_payload === 'object'
      ? (payment.raw_provider_payload as Record<string, unknown>)
      : {};
  const refunds = Array.isArray((existingPayload as any).refunds)
    ? [...(existingPayload as any).refunds, refund]
    : [refund];

  const { error: updateError } = await admin
    .from('payments')
    .update({
      status: newStatus,
      cancel_reason: 'refunded_by_admin',
      raw_provider_payload: { ...existingPayload, refunds },
    })
    .eq('id', payment.id);

  if (updateError) {
    console.error('[admin/refund] DB update failed after refund:', updateError);
    // refund already succeeded on LuniPay; surface the error so an operator
    // can manually reconcile, but don't 500 the route — refund DID happen.
    return NextResponse.json(
      {
        ok: true,
        warning: 'Refund succeeded but local DB update failed',
        details: updateError.message,
        refund,
      },
      { status: 200 }
    );
  }

  if (payment.payer_id) {
    await admin.from('notifications').insert({
      user_id: payment.payer_id,
      type: 'payment_refunded',
      title: 'Refund issued',
      message: `A refund of $${refundAmountTtd.toFixed(2)} TTD has been issued. It will appear on your card within a few business days.`,
      link: '/student/bookings',
      created_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    payment_id: payment.id,
    refund,
    status: newStatus,
  });
}
