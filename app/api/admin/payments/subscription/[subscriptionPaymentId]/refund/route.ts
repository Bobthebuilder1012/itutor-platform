// POST /api/admin/payments/subscription/:subscriptionPaymentId/refund
//
// Admin fallback for a removed student's full monthly subscription refund.
// Uses the same ledger-aware helper as tutor removal:
//   - unreleased payout: refund student, reverse payout_ledger
//   - released payout: refund student, create tutor_deductions recovery

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { refundRemovedSubscription } from '@/lib/payments/subscriptionRemovalRefund';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _request: NextRequest,
  { params }: { params: { subscriptionPaymentId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();
  const { subscriptionPaymentId } = params;

  const { data: sp, error: spError } = await admin
    .from('subscription_payments')
    .select('id, enrollment_id, group_id, student_id, amount_ttd, status')
    .eq('id', subscriptionPaymentId)
    .maybeSingle();

  if (spError || !sp) {
    return NextResponse.json(
      { error: spError?.message ?? 'Subscription payment not found' },
      { status: 404 }
    );
  }

  const { data: group } = await admin
    .from('groups')
    .select('tutor_id')
    .eq('id', sp.group_id)
    .maybeSingle();

  if (!group?.tutor_id) {
    return NextResponse.json({ error: 'Group tutor not found' }, { status: 404 });
  }

  const { data: removal } = await admin
    .from('group_removals')
    .select('id')
    .eq('enrollment_id', sp.enrollment_id)
    .eq('refund_issued', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const result = await refundRemovedSubscription({
    admin: admin as any,
    subscriptionPaymentId: sp.id,
    enrollmentId: sp.enrollment_id,
    groupId: sp.group_id,
    removalId: removal?.id ?? null,
    tutorId: group.tutor_id,
    actorId: auth.user!.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: result.status }
    );
  }

  await admin.rpc('process_subscription_removal', {
    p_payload: {
      enrollment_id: sp.enrollment_id,
      removal_id: removal?.id ?? null,
      refund_amount_ttd: result.refundAmountTtd,
    },
  });
  await admin
    .from('group_enrollments')
    .update({ payment_status: 'REFUNDED' })
    .eq('id', sp.enrollment_id);

  return NextResponse.json({
    ok: true,
    subscription_payment_id: sp.id,
    refunded_amount_ttd: result.refundAmountTtd,
    refund_path: result.path,
    deduction_amount_ttd: result.deductionAmountTtd,
    pending_deduction_ttd: result.pendingDeductionTtd,
    lunipay_refund_id: result.lunipayRefundId,
  });
}

