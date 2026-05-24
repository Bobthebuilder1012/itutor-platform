// =====================================================
// ADMIN REFUND PAYMENT
// =====================================================
// POST /api/admin/payments/:paymentId/refund
// Body: {
//   amount_ttd?: number,           // omit = full refund
//   retained_amount_ttd?: number,  // partial-retention flow only
//   reason?: RefundReason          // taxonomy in lib/payments/refundService
// }
//
// Thin wrapper around lib/payments/refundService.refundPayment.
// All ledger / balance / notification logic lives in the service.
//
// Backward compatibility: a request with no body (or with the legacy
// LuniPay reason values 'duplicate' / 'fraudulent' /
// 'requested_by_customer') is treated as a full refund with reason
// 'admin_manual', matching the prior endpoint's behaviour.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import {
  refundPayment,
  type RefundReason,
} from '@/lib/payments/refundService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TAXONOMY: ReadonlySet<RefundReason> = new Set<RefundReason>([
  'student_cancelled',
  'tutor_cancelled',
  'tutor_noshow',
  'tie_inconclusive',
  'slot_conflict',
  'student_late_cancel',
  'student_noshow',
  'admin_manual',
]);

export async function POST(
  request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  const requestedAmount =
    body?.amount_ttd != null ? Number(body.amount_ttd) : undefined;
  const retainedAmount =
    body?.retained_amount_ttd != null ? Number(body.retained_amount_ttd) : undefined;

  const reason: RefundReason = TAXONOMY.has(body?.reason)
    ? (body.reason as RefundReason)
    : 'admin_manual';

  if (
    requestedAmount !== undefined &&
    (!Number.isFinite(requestedAmount) || requestedAmount <= 0)
  ) {
    return NextResponse.json(
      { error: 'amount_ttd must be a positive number when provided' },
      { status: 400 }
    );
  }
  if (
    retainedAmount !== undefined &&
    (!Number.isFinite(retainedAmount) || retainedAmount < 0)
  ) {
    return NextResponse.json(
      { error: 'retained_amount_ttd must be a non-negative number when provided' },
      { status: 400 }
    );
  }

  const result = await refundPayment({
    paymentId: params.paymentId,
    reason,
    refundAmountTtd: requestedAmount,
    retainedAmountTtd: retainedAmount,
    actorId: auth.user!.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code, details: result.details },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    payment_id: result.paymentId,
    status: result.newPaymentStatus,
    ledger_action: result.ledgerAction,
    refund_amount_ttd: result.refundAmountTtd,
    retained_amount_ttd: result.retainedAmountTtd,
    total_refunded_ttd: result.totalRefundedTtd,
    refund: result.refund,
    warning: result.warning,
  });
}
