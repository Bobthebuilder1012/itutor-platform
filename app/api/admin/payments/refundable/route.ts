// =====================================================
// LIST REFUNDABLE + RECENTLY REFUNDED PAYMENTS (ADMIN)
// =====================================================
// GET /api/admin/payments/refundable
// Returns two lists:
//   - awaiting:  orphan payments (status='succeeded' AND booking_id IS NULL)
//                where the student paid but no booking was created. These
//                need a manual admin refund click.
//   - processed: payments already refunded or partially refunded, sorted
//                newest first. Audit view for flows that refund themselves
//                (cancellations, tutor no-shows, admin clicks, etc.).
// =====================================================

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROCESSED_LIMIT = 50;

export async function GET() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  const [awaitingRes, processedRes] = await Promise.all([
    // Orphan payments — succeeded but no booking row.
    admin
      .from('payments')
      .select(
        'id, payer_id, amount_ttd, total_refunded_ttd, status, cancel_reason, paid_at, refunded_at, ' +
          'lunipay_payment_id, lunipay_checkout_session_id, booking_id'
      )
      .eq('status', 'succeeded')
      .is('booking_id', null)
      .not('lunipay_payment_id', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(100),
    // Refunds that have already been processed (audit view).
    admin
      .from('payments')
      .select(
        'id, payer_id, amount_ttd, total_refunded_ttd, status, cancel_reason, paid_at, refunded_at, ' +
          'lunipay_payment_id, lunipay_checkout_session_id, booking_id'
      )
      .in('status', ['refunded', 'partially_refunded'])
      .order('refunded_at', { ascending: false, nullsFirst: false })
      .limit(PROCESSED_LIMIT),
  ]);

  if (awaitingRes.error) {
    return NextResponse.json({ error: awaitingRes.error.message }, { status: 500 });
  }
  if (processedRes.error) {
    return NextResponse.json({ error: processedRes.error.message }, { status: 500 });
  }

  const awaiting = awaitingRes.data ?? [];
  const processed = processedRes.data ?? [];
  const bookingIds = Array.from(
    new Set(processed.map((p: any) => p.booking_id).filter(Boolean))
  );

  const payerIds = Array.from(
    new Set([...awaiting, ...processed].map((p: any) => p.payer_id).filter(Boolean))
  );

  const [{ data: profiles }, { data: sessions }] = await Promise.all([
    payerIds.length
      ? admin.from('profiles').select('id, full_name, email').in('id', payerIds)
      : Promise.resolve({ data: [] as any[] }),
    bookingIds.length
      ? admin
          .from('sessions')
          .select('booking_id, status')
          .in('booking_id', bookingIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const sessionStatusByBookingId = new Map(
    (sessions ?? []).map((s: any) => [s.booking_id, s.status])
  );

  const enrich = (p: any) => ({
    id: p.id,
    payer_id: p.payer_id,
    payer_name: profileById.get(p.payer_id)?.full_name ?? null,
    payer_email: profileById.get(p.payer_id)?.email ?? null,
    amount_ttd: Number(p.amount_ttd ?? 0),
    refunded_amount_ttd: Number(p.total_refunded_ttd ?? 0),
    currency: 'TTD',
    status: p.status,
    cancel_reason: p.cancel_reason,
    paid_at: p.paid_at,
    refunded_at: p.refunded_at ?? null,
    lunipay_payment_id: p.lunipay_payment_id,
    lunipay_checkout_session_id: p.lunipay_checkout_session_id,
    booking_id: p.booking_id,
    session_status: p.booking_id ? sessionStatusByBookingId.get(p.booking_id) ?? null : null,
  });

  return NextResponse.json({
    payments: awaiting.map(enrich), // kept for backwards compatibility
    awaiting: awaiting.map(enrich),
    processed: processed.map(enrich),
  });
}
