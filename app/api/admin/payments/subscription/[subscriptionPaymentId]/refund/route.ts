// POST /api/admin/payments/subscription/:subscriptionPaymentId/refund
//
// Issues a full refund for a subscription_payment that is still PAID.
// Used by the Lesson Payments admin page — "Pending Refunds - Removed" tab.
//
// Flow:
//   1. Load subscription_payment; verify it's PAID and hasn't been refunded.
//   2. Call LuniPay refund via lunipay_transaction_id.
//   3. Atomically update:
//        subscription_payments.status = 'REFUNDED'
//        group_enrollments.payment_status = 'REFUNDED'
//        group_removals.refund_issued = true (if a removal row exists)
//   4. Reverse the payout_ledger row (if it exists and hasn't been reversed).
//
// Idempotency: subsequent calls for an already-REFUNDED payment return 409.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { LuniPayError } from 'lunipay';
import { getLunipayClient } from '@/lib/payments/lunipayClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _request: NextRequest,
  { params }: { params: { subscriptionPaymentId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { subscriptionPaymentId } = params;
  const admin = getServiceClient();

  // ── 1. Load subscription_payment ─────────────────────────────────────────
  const { data: sp, error: spErr } = await admin
    .from('subscription_payments')
    .select('id, enrollment_id, amount_ttd, lunipay_transaction_id, status')
    .eq('id', subscriptionPaymentId)
    .maybeSingle();

  if (spErr || !sp) {
    return NextResponse.json(
      { error: spErr?.message ?? 'Subscription payment not found' },
      { status: 404 }
    );
  }

  if (sp.status === 'REFUNDED') {
    return NextResponse.json({ error: 'Payment has already been refunded' }, { status: 409 });
  }
  if (sp.status !== 'PAID') {
    return NextResponse.json(
      { error: `Payment is in '${sp.status}' state and cannot be refunded` },
      { status: 422 }
    );
  }
  if (!sp.lunipay_transaction_id) {
    return NextResponse.json(
      { error: 'No LuniPay transaction ID found — cannot issue refund' },
      { status: 422 }
    );
  }

  // ── 2. LuniPay refund ────────────────────────────────────────────────────
  const lunipay = getLunipayClient();
  let luniRefund: any;

  try {
    luniRefund = await lunipay.payments.refund(
      sp.lunipay_transaction_id,
      {
        reason: 'requested_by_customer',
        metadata: {
          subscription_payment_id: sp.id,
          admin_id: auth.user!.id,
          reason: 'admin_subscription_refund',
        },
      } as any
    );
  } catch (err: any) {
    const isApiError = err instanceof LuniPayError;
    console.error('[subscription refund] LuniPay error:', err);
    return NextResponse.json(
      { error: 'LuniPay refund failed', details: isApiError ? err.message : String(err) },
      { status: 502 }
    );
  }

  // ── 3. Update DB records ─────────────────────────────────────────────────
  const now = new Date().toISOString();

  const [spUpdate, enrollmentUpdate, removalUpdate] = await Promise.all([
    admin
      .from('subscription_payments')
      .update({ status: 'REFUNDED', refunded_at: now })
      .eq('id', sp.id),

    admin
      .from('group_enrollments')
      .update({ payment_status: 'REFUNDED', updated_at: now })
      .eq('id', sp.enrollment_id),

    // Mark the removal row as refunded if it exists
    admin
      .from('group_removals')
      .update({
        refund_issued: true,
        refund_amount_ttd: sp.amount_ttd,
        resolved_at: now,
        admin_id: auth.user!.id,
      })
      .eq('enrollment_id', sp.enrollment_id)
      .eq('refund_issued', false),
  ]);

  const dbErrors = [spUpdate.error, enrollmentUpdate.error, removalUpdate.error].filter(Boolean);
  if (dbErrors.length > 0) {
    const msgs = dbErrors.map((e: any) => e.message).join('; ');
    console.error('[subscription refund] DB update errors after successful LuniPay refund:', msgs);
    // LuniPay refund already issued — return partial success so admin knows
    return NextResponse.json({
      ok: true,
      warning: 'refund_issued_db_sync_pending',
      message: 'LuniPay refund was issued but DB records could not be fully updated. Please sync manually.',
      lunipay_refund_id: luniRefund?.id,
      db_errors: msgs,
    });
  }

  // ── 4. Reverse payout_ledger if it exists and hasn't been reversed ────────
  const { data: ledgerRow } = await admin
    .from('payout_ledger')
    .select('id, status')
    .eq('subscription_payment_id', sp.id)
    .neq('status', 'reversed')
    .maybeSingle();

  if (ledgerRow) {
    const { error: reverseErr } = await (admin as any).rpc('reverse_payout_ledger_row', {
      p_ledger_id:  ledgerRow.id,
      p_removal_id: null,
    });
    if (reverseErr) {
      console.error('[subscription refund] reverse_payout_ledger_row failed:', reverseErr);
    }
  }

  return NextResponse.json({
    ok: true,
    subscription_payment_id: sp.id,
    refunded_amount_ttd: Number(sp.amount_ttd),
    lunipay_refund_id: luniRefund?.id,
  });
}
