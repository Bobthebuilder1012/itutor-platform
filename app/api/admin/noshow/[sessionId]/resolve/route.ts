// =====================================================
// ADMIN NO-SHOW RESOLVE
// =====================================================
// POST /api/admin/noshow/:sessionId/resolve
// Body: { outcome: 'student_noshow' | 'tutor_noshow' | 'tie' }
//
// Maps the admin's verdict onto a refund shape, hands it to
// lib/payments/refundService, and lets the side-effects RPC apply
// the matching session status. This endpoint exists so admins can
// resolve disputes via API/UI today; the eventual noshow_claims
// workflow (evidence upload, 12-hour response cron) will sit on top
// of this same primitive.
//
// Outcome mapping:
//   student_noshow → 50/50 retention; sessions.status='NO_SHOW_STUDENT'
//   tutor_noshow   → full refund;     sessions.status='NO_SHOW_TUTOR'
//   tie            → full refund;     sessions.status='MUTUAL_NON_COMPLETION'
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { refundPayment, type RefundReason } from '@/lib/payments/refundService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Outcome = 'student_noshow' | 'tutor_noshow' | 'tie';

interface ResolveBody {
  outcome?: Outcome;
}

const VALID_OUTCOMES: ReadonlySet<Outcome> = new Set([
  'student_noshow',
  'tutor_noshow',
  'tie',
]);

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as ResolveBody;
  if (!body.outcome || !VALID_OUTCOMES.has(body.outcome)) {
    return NextResponse.json(
      { error: "outcome must be one of 'student_noshow' | 'tutor_noshow' | 'tie'" },
      { status: 400 }
    );
  }
  const outcome: Outcome = body.outcome;

  const admin = getServiceClient();

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select('id, booking_id, status, charge_amount_ttd')
    .eq('id', params.sessionId)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (!session.booking_id) {
    return NextResponse.json(
      { error: 'Session has no booking — cannot resolve' },
      { status: 400 }
    );
  }

  // Active payment for the booking.
  const { data: payment } = await admin
    .from('payments')
    .select('id, status, amount_ttd, total_refunded_ttd')
    .eq('booking_id', session.booking_id)
    .in('status', ['succeeded', 'partially_refunded'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) {
    return NextResponse.json(
      { error: 'No refundable payment found for this booking' },
      { status: 404 }
    );
  }

  const amountTtd = Number(payment.amount_ttd ?? 0);
  const alreadyRefunded = Number(payment.total_refunded_ttd ?? 0);
  const remaining = +(amountTtd - alreadyRefunded).toFixed(2);

  if (remaining <= 0) {
    return NextResponse.json(
      { error: 'Payment is already fully refunded' },
      { status: 409 }
    );
  }

  let refundAmountTtd: number;
  let retainedAmountTtd: number;
  let reason: RefundReason;
  let sessionStatusOverride: string;

  switch (outcome) {
    case 'student_noshow':
      refundAmountTtd = +(remaining / 2).toFixed(2);
      retainedAmountTtd = +(remaining - refundAmountTtd).toFixed(2);
      reason = 'student_noshow';
      sessionStatusOverride = 'NO_SHOW_STUDENT';
      break;
    case 'tutor_noshow':
      refundAmountTtd = remaining;
      retainedAmountTtd = 0;
      reason = 'tutor_noshow';
      sessionStatusOverride = 'NO_SHOW_TUTOR';
      break;
    case 'tie':
      refundAmountTtd = remaining;
      retainedAmountTtd = 0;
      reason = 'tie_inconclusive';
      sessionStatusOverride = 'MUTUAL_NON_COMPLETION';
      break;
  }

  const result = await refundPayment({
    paymentId: payment.id,
    reason,
    refundAmountTtd,
    retainedAmountTtd,
    actorId: auth.user!.id,
    sessionStatusOverride,
    client: admin,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code, details: result.details },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    session_id: session.id,
    outcome,
    session_status: sessionStatusOverride,
    payment_status: result.newPaymentStatus,
    ledger_action: result.ledgerAction,
    refund_amount_ttd: result.refundAmountTtd,
    retained_amount_ttd: result.retainedAmountTtd,
    total_refunded_ttd: result.totalRefundedTtd,
    warning: result.warning,
  });
}
