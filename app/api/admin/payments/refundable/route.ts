// =====================================================
// LIST REFUNDABLE PAYMENTS (ADMIN)
// =====================================================
// GET /api/admin/payments/refundable
// Returns payments that are succeeded but flagged for refund — most
// commonly slot-conflict cases where the student paid but their
// booking couldn't be created.
// =====================================================

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  // succeeded payments that either:
  //   - have no booking (slot-conflict refund case), or
  //   - carry an explicit cancel_reason
  // and haven't already been refunded, with a LuniPay payment id we
  // can call refund against.
  const { data: payments, error } = await admin
    .from('payments')
    .select(
      'id, payer_id, amount_ttd, currency, status, cancel_reason, paid_at, ' +
        'lunipay_payment_id, lunipay_checkout_session_id, booking_id, raw_provider_payload'
    )
    .eq('status', 'succeeded')
    .not('lunipay_payment_id', 'is', null)
    .or('booking_id.is.null,cancel_reason.not.is.null')
    .order('paid_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!payments || payments.length === 0) {
    return NextResponse.json({ payments: [] });
  }

  const payerIds = Array.from(
    new Set(payments.map((p: any) => p.payer_id).filter(Boolean))
  );
  const { data: profiles } = payerIds.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', payerIds)
    : { data: [] };

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  const enriched = payments.map((p: any) => ({
    id: p.id,
    payer_id: p.payer_id,
    payer_name: profileById.get(p.payer_id)?.full_name ?? null,
    payer_email: profileById.get(p.payer_id)?.email ?? null,
    amount_ttd: Number(p.amount_ttd ?? 0),
    currency: p.currency ?? 'TTD',
    cancel_reason: p.cancel_reason,
    paid_at: p.paid_at,
    lunipay_payment_id: p.lunipay_payment_id,
    lunipay_checkout_session_id: p.lunipay_checkout_session_id,
    booking_id: p.booking_id,
  }));

  return NextResponse.json({ payments: enriched });
}
