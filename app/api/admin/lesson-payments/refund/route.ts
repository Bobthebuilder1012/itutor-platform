// POST /api/admin/lesson-payments/refund
// Admin approves a refund for a removed student.
//
// Path A (payout not released): reverses the payout_ledger row, refunds via LuniPay.
// Path B (payout already released): refunds from platform balance, deducts from tutor's
//   future earnings via tutor_deductions table.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  let body: { removal_id: string; enrollment_id: string; subscription_payment_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { removal_id, enrollment_id, subscription_payment_id } = body;
  if (!removal_id || !enrollment_id) {
    return NextResponse.json({ error: 'removal_id and enrollment_id are required' }, { status: 400 });
  }

  // 1. Load the removal record
  const { data: removal, error: removalErr } = await admin
    .from('group_removals')
    .select('id, enrollment_id, refund_amount_ttd, refund_issued, student_id, tutor_id, group_id')
    .eq('id', removal_id)
    .single();

  if (removalErr || !removal) {
    return NextResponse.json({ error: 'Removal record not found' }, { status: 404 });
  }

  if (removal.refund_issued) {
    return NextResponse.json({ error: 'Refund already issued' }, { status: 409 });
  }

  const refundAmount = Number(removal.refund_amount_ttd ?? 0);
  if (refundAmount <= 0) {
    // Nothing to refund — just mark as done
    await admin.from('group_removals').update({
      refund_issued: true,
      resolved_at: new Date().toISOString(),
      admin_notes: 'No refund amount — marked complete.',
    }).eq('id', removal_id);

    await admin.from('group_enrollments').update({ payment_status: 'REFUNDED' }).eq('id', enrollment_id);
    return NextResponse.json({ success: true, path: 'no_refund_needed' });
  }

  // 2. Find the subscription payment
  let spId = subscription_payment_id;
  if (!spId) {
    const { data: sp } = await admin
      .from('subscription_payments')
      .select('id')
      .eq('enrollment_id', enrollment_id)
      .eq('status', 'PAID')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    spId = sp?.id;
  }

  if (!spId) {
    return NextResponse.json({ error: 'No PAID subscription payment found' }, { status: 400 });
  }

  const { data: subPayment, error: spErr } = await admin
    .from('subscription_payments')
    .select('id, amount_ttd, lunipay_transaction_id, tutor_payout_ttd, platform_fee_ttd')
    .eq('id', spId)
    .single();

  if (spErr || !subPayment) {
    return NextResponse.json({ error: 'Subscription payment not found' }, { status: 404 });
  }

  // 3. Check payout_ledger to determine Path A vs Path B
  const { data: ledgerRows } = await admin
    .from('payout_ledger')
    .select('id, status, batch_id, amount_ttd')
    .eq('subscription_payment_id', spId)
    .order('created_at', { ascending: false })
    .limit(1);

  const ledger = ledgerRows?.[0] ?? null;
  const payoutReleased = ledger &&
    (ledger.status === 'released' || (ledger.batch_id !== null));

  // ── Path A: Payout NOT released — reverse ledger, refund via LuniPay ────
  if (!payoutReleased) {
    // Reverse the ledger row if it exists
    if (ledger && ledger.status !== 'reversed') {
      const { error: reverseErr } = await admin.rpc('reverse_payout_ledger_row', {
        p_ledger_id: ledger.id,
        p_removal_id: removal_id,
        p_admin_id: auth.user.id,
        p_notes: 'Admin-approved refund for removed student.',
      });

      if (reverseErr) {
        console.error('[refund] reverse_payout_ledger_row failed:', reverseErr);
        return NextResponse.json({ error: `Failed to reverse ledger: ${reverseErr.message}` }, { status: 500 });
      }
    }

    // Refund via LuniPay
    if (subPayment.lunipay_transaction_id) {
      try {
        const { getLunipayClient, ttdToCents } = await import('@/lib/payments/lunipayClient');
        const lunipay = getLunipayClient();
        await lunipay.payments.refund(subPayment.lunipay_transaction_id, {
          amount: ttdToCents(refundAmount),
          reason: 'requested_by_customer', metadata: { removal_reason: 'student_removed_admin_approved' },
        });
      } catch (e: any) {
        console.error('[refund] LuniPay refund failed:', e);
        return NextResponse.json({ error: `LuniPay refund failed: ${e.message}` }, { status: 500 });
      }
    } else {
      console.warn('[refund] No LuniPay transaction ID — skipping gateway refund');
    }

    // Record the refund
    await admin.from('subscription_refunds').insert({
      subscription_payment_id: spId,
      amount_ttd: refundAmount,
      refunded_by: auth.user.id,
      reason: 'Student removal - admin approved (Path A)',
    });

    // Mark everything as done
    await admin.from('group_removals').update({
      refund_issued: true,
      resolved_at: new Date().toISOString(),
      admin_notes: `Refund approved via Path A (ledger reversed). Amount: TT${refundAmount.toFixed(2)}`,
    }).eq('id', removal_id);

    await admin.from('subscription_payments').update({ status: 'REFUNDED' }).eq('id', spId);
    await admin.from('group_enrollments').update({ payment_status: 'REFUNDED' }).eq('id', enrollment_id);

    return NextResponse.json({ success: true, path: 'A', note: 'Ledger reversed, LuniPay refund processed.' });
  }

  // ── Path B: Payout already released — refund from platform, deduct tutor ──
  // Refund via LuniPay from platform balance
  if (subPayment.lunipay_transaction_id) {
    try {
      const { getLunipayClient, ttdToCents } = await import('@/lib/payments/lunipayClient');
      const lunipay = getLunipayClient();
      await lunipay.payments.refund(subPayment.lunipay_transaction_id, {
        amount: ttdToCents(refundAmount),
        reason: 'requested_by_customer', metadata: { removal_reason: 'student_removed_tutor_paid_path_b' },
      });
    } catch (e: any) {
      console.error('[refund] LuniPay refund failed:', e);
      return NextResponse.json({ error: `LuniPay refund failed: ${e.message}` }, { status: 500 });
    }
  }

  // Create tutor deduction
  const { error: deductErr } = await admin.from('tutor_deductions').insert({
    tutor_id: removal.tutor_id,
    amount_ttd: refundAmount,
    reason: 'student_removal_refund',
    source_enrollment_id: enrollment_id,
    source_subscription_payment_id: spId,
    status: 'pending',
  });

  if (deductErr) {
    console.error('[refund] tutor_deductions insert failed:', deductErr);
    return NextResponse.json({ error: `Failed to record tutor deduction: ${deductErr.message}` }, { status: 500 });
  }

  // Deduct from tutor's available balance if possible
  const { data: tutorBal } = await admin
    .from('tutor_balances')
    .select('available_ttd')
    .eq('tutor_id', removal.tutor_id)
    .maybeSingle();

  const available = Number(tutorBal?.available_ttd ?? 0);
  if (available >= refundAmount) {
    await admin
      .from('tutor_balances')
      .update({ available_ttd: available - refundAmount })
      .eq('tutor_id', removal.tutor_id);
  }
  // If not enough, the pending deduction will be recovered from future batches

  // Record the refund
  await admin.from('subscription_refunds').insert({
    subscription_payment_id: spId,
    amount_ttd: refundAmount,
    refunded_by: auth.user.id,
    reason: 'Student removal - admin approved (Path B - tutor deduction)',
  });

  // Mark everything as done
  await admin.from('group_removals').update({
    refund_issued: true,
    resolved_at: new Date().toISOString(),
    admin_notes: `Refund approved via Path B (tutor already paid). TT$${refundAmount.toFixed(2)} deducted from tutor.`,
  }).eq('id', removal_id);

  await admin.from('subscription_payments').update({ status: 'REFUNDED' }).eq('id', spId);
  await admin.from('group_enrollments').update({ payment_status: 'REFUNDED' }).eq('id', enrollment_id);

  return NextResponse.json({
    success: true,
    path: 'B',
    note: 'LuniPay refund processed from platform balance. Amount deducted from tutor future earnings.',
    deduction_amount: refundAmount,
  });
}
