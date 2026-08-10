// POST /api/admin/payments/subscription/:subscriptionPaymentId/reverse
//
// Marks a group payment (subscription or secured spot) as reversed WITHOUT
// calling Stripe. For money that never really moved, or that was returned out
// of band — a test charge, a manual bank refund, a duplicate.
//
// This is NOT the refund route. /refund issues a real Stripe refund and is
// tied to the removal flow. This one only corrects our own records, which is
// why it demands a written reason and audits every use: from the outside a
// reversal and a refund look identical, and only the reason distinguishes a
// correction from money quietly written off.
//
// The ledger work goes through reverse_payout_ledger_row, which is idempotent,
// refuses to touch an already-released payout, and decrements the right
// balance bucket (pending for 'owed', available for 'release_ready'). Doing
// that arithmetic here by hand is how tutor_balances drifts.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ subscriptionPaymentId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { subscriptionPaymentId } = await params;
  const body = await request.json().catch(() => ({} as any));
  const reason: string = String(body?.reason ?? '').trim();

  // Required, and required to be meaningful. "test" tells the next person
  // nothing when they are looking at a tutor's short payout months later.
  if (reason.length < 10) {
    return NextResponse.json(
      { error: 'A reason of at least 10 characters is required.' },
      { status: 400 }
    );
  }

  const admin = getServiceClient();

  const { data: payment, error: paymentError } = await admin
    .from('subscription_payments')
    .select('id, group_id, student_id, enrollment_id, amount_ttd, tutor_payout_ttd, status, type')
    .eq('id', subscriptionPaymentId)
    .maybeSingle();

  if (paymentError || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  const { data: ledgerRows, error: ledgerError } = await admin
    .from('payout_ledger')
    .select('id, status, amount_ttd, tutor_id')
    .eq('subscription_payment_id', subscriptionPaymentId);

  if (ledgerError) {
    return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  // A released row is already money out of the door — reversing it in our
  // records would leave the books claiming we hold something we have paid
  // away. That needs a tutor_deductions recovery, not a status flip.
  const released = (ledgerRows ?? []).filter((r: any) => r.status === 'released');
  if (released.length > 0) {
    return NextResponse.json(
      {
        error: 'This payout has already been released to the tutor and cannot be reversed here.',
        released_ledger_ids: released.map((r: any) => r.id),
      },
      { status: 409 }
    );
  }

  const reversed: string[] = [];
  for (const row of ledgerRows ?? []) {
    const { data: rpc, error: rpcError } = await (admin as any).rpc('reverse_payout_ledger_row', {
      p_ledger_id: row.id,
      p_removal_id: null,
      p_admin_id: auth.user?.id ?? null,
      p_notes: `Admin reversal (no Stripe refund): ${reason}`,
    });
    if (rpcError) {
      console.error('[admin/reverse] ledger reversal failed:', rpcError.message);
      return NextResponse.json(
        { error: `Ledger reversal failed: ${rpcError.message}`, reversed_so_far: reversed },
        { status: 500 }
      );
    }
    if (rpc?.ok) reversed.push(row.id);
  }

  await admin
    .from('subscription_payments')
    .update({ status: 'REFUNDED', refunded_at: new Date().toISOString() })
    .eq('id', subscriptionPaymentId);

  // A secured spot that is reversed is no longer a held place: release the
  // seat rather than leaving a student occupying capacity they haven't paid
  // for. Subscriptions are left alone — reversing one payment does not end
  // the subscription, and Stripe still owns that cycle.
  if (payment.type === 'secure_spot' && payment.enrollment_id) {
    await admin
      .from('group_enrollments')
      .update({ payment_status: 'REFUNDED', status: 'CANCELLED' })
      .eq('id', payment.enrollment_id)
      .eq('status', 'SECURED');
  }

  await logAdminAction(
    { id: auth.user?.id ?? null, email: auth.user?.email ?? null },
    {
      action: 'payment.reverse_no_refund',
      targetType: 'subscription_payment',
      targetId: subscriptionPaymentId,
      targetLabel: `TT$${Number(payment.amount_ttd ?? 0).toFixed(2)} · ${payment.type}`,
      reason,
      details: {
        ledger_rows_reversed: reversed,
        tutor_payout_ttd: payment.tutor_payout_ttd,
        stripe_refund_issued: false,
      },
    }
  );

  return NextResponse.json({
    ok: true,
    subscription_payment_id: subscriptionPaymentId,
    ledger_rows_reversed: reversed.length,
    stripe_refund_issued: false,
  });
}
