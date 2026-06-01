// POST /api/admin/payout-cases/:id/resolve
//
// Body: {
//   action: 'release_to_tutor' | 'refund_student' | 'partial_refund',
//   refund_amount_ttd?: number,   // required for partial_refund; student-facing
//   release_amount_ttd?: number,  // required for partial_refund; tutor-facing
//   admin_notes?: string,
// }
//
// Flow for refund paths:
//   1. Find the refundable payment linked to the case.
//   2. Call LuniPay refund with idempotency key `case-refund-{caseId}`.
//   3. Update payments.total_refunded_ttd + status.
//   4. Call resolve_payout_case RPC (ledger transition + case close, atomic).
//   5. Notify tutor.
//
// Reconciliation: if LuniPay succeeds but the RPC fails the route returns
// { ok: true, warning: 'refund_issued_db_sync_pending' } — the idempotency
// key prevents double-refund on admin retry.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { getLunipayClient, ttdToCents } from '@/lib/payments/lunipayClient';
import { LuniPayError } from 'lunipay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Action = 'release_to_tutor' | 'refund_student' | 'partial_refund';

interface ResolveBody {
  action?: Action;
  refund_amount_ttd?: number;
  release_amount_ttd?: number;
  admin_notes?: string;
}

const VALID_ACTIONS: ReadonlySet<Action> = new Set([
  'release_to_tutor',
  'refund_student',
  'partial_refund',
]);

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as ResolveBody;

  if (!body.action || !VALID_ACTIONS.has(body.action)) {
    return NextResponse.json(
      { error: "action must be 'release_to_tutor', 'refund_student', or 'partial_refund'" },
      { status: 400 }
    );
  }
  const action: Action = body.action;
  const caseId = params.id;

  if (action === 'partial_refund') {
    if (!body.refund_amount_ttd || body.refund_amount_ttd <= 0) {
      return NextResponse.json(
        { error: 'refund_amount_ttd is required and must be > 0 for partial_refund' },
        { status: 400 }
      );
    }
    if (body.release_amount_ttd === undefined || body.release_amount_ttd < 0) {
      return NextResponse.json(
        { error: 'release_amount_ttd is required and must be >= 0 for partial_refund' },
        { status: 400 }
      );
    }
  }

  const admin = getServiceClient();

  // ── Fetch the case ─────────────────────────────────────────────────────────
  const { data: payoutCase, error: caseError } = await admin
    .from('payout_cases')
    .select(`
      id, status, tutor_id,
      payout_ledger_id, session_id, subscription_payment_id, payment_id,
      payout_ledger:payout_ledger_id(id, amount_ttd, status)
    `)
    .eq('id', caseId)
    .maybeSingle();

  if (caseError) {
    return NextResponse.json({ error: caseError.message }, { status: 500 });
  }
  if (!payoutCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  if (!['open', 'under_review'].includes(payoutCase.status)) {
    return NextResponse.json(
      { error: `Case is already '${payoutCase.status}' and cannot be resolved` },
      { status: 409 }
    );
  }

  const ledger = payoutCase.payout_ledger as any;

  if (action === 'partial_refund' && !ledger) {
    return NextResponse.json(
      { error: 'partial_refund requires an existing payout_ledger row; this case has no ledger yet' },
      { status: 422 }
    );
  }

  // ── Release to tutor — no LuniPay call needed ──────────────────────────────
  if (action === 'release_to_tutor') {
    const { data: rpcResult, error: rpcError } = await (admin as any).rpc('resolve_payout_case', {
      p_case_id:     caseId,
      p_action:      'release_to_tutor',
      p_admin_id:    auth.user!.id,
      p_admin_notes: body.admin_notes ?? null,
    });

    if (rpcError) {
      console.error('[POST /api/admin/payout-cases/:id/resolve] resolve_payout_case failed:', rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    await notifyTutor(admin, payoutCase.tutor_id, action, ledger?.amount_ttd ?? 0);

    return NextResponse.json({ ok: true, case_id: caseId, action, rpc: rpcResult });
  }

  // ── Refund paths: find the payment ─────────────────────────────────────────
  type PaymentInfo = {
    id: string;
    lunipay_payment_id: string;
    amount_ttd: number;
    total_refunded_ttd: number;
    status: string;
    is_subscription: boolean;
  };

  let payment: PaymentInfo | null = null;

  if (payoutCase.payment_id) {
    const { data } = await admin
      .from('payments')
      .select('id, lunipay_payment_id, amount_ttd, total_refunded_ttd, status')
      .eq('id', payoutCase.payment_id)
      .maybeSingle();
    if (data?.lunipay_payment_id) {
      payment = { ...data, amount_ttd: Number(data.amount_ttd), total_refunded_ttd: Number(data.total_refunded_ttd ?? 0), is_subscription: false };
    }
  }

  if (!payment && payoutCase.session_id) {
    const { data: session } = await admin
      .from('sessions')
      .select('booking_id')
      .eq('id', payoutCase.session_id)
      .maybeSingle();

    if (session?.booking_id) {
      const { data } = await admin
        .from('payments')
        .select('id, lunipay_payment_id, amount_ttd, total_refunded_ttd, status')
        .eq('booking_id', session.booking_id)
        .in('status', ['succeeded', 'partially_refunded'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.lunipay_payment_id) {
        payment = { ...data, amount_ttd: Number(data.amount_ttd), total_refunded_ttd: Number(data.total_refunded_ttd ?? 0), is_subscription: false };
      }
    }
  }

  if (!payment && payoutCase.subscription_payment_id) {
    const { data: sp } = await admin
      .from('subscription_payments')
      .select('id, lunipay_transaction_id, amount_ttd')
      .eq('id', payoutCase.subscription_payment_id)
      .maybeSingle();
    if (sp?.lunipay_transaction_id) {
      payment = {
        id: sp.id,
        lunipay_payment_id: sp.lunipay_transaction_id,
        amount_ttd: Number(sp.amount_ttd),
        total_refunded_ttd: 0,
        status: 'succeeded',
        is_subscription: true,
      };
    }
  }

  if (!payment) {
    return NextResponse.json(
      { error: 'No refundable payment found for this case' },
      { status: 404 }
    );
  }

  const paymentAmountTtd  = payment.amount_ttd;
  const alreadyRefunded   = payment.total_refunded_ttd;
  const remaining         = +(paymentAmountTtd - alreadyRefunded).toFixed(2);

  if (remaining <= 0) {
    return NextResponse.json({ error: 'Payment is already fully refunded' }, { status: 409 });
  }

  const refundAmountTtd = action === 'partial_refund'
    ? +(body.refund_amount_ttd!).toFixed(2)
    : remaining;

  if (refundAmountTtd > remaining + 0.005) {
    return NextResponse.json(
      { error: `refund_amount_ttd ${refundAmountTtd} exceeds remaining refundable amount ${remaining}` },
      { status: 400 }
    );
  }

  // ── LuniPay refund ─────────────────────────────────────────────────────────
  const isFullRefund      = Math.abs(refundAmountTtd - remaining) < 0.005;
  const refundAmountCents = isFullRefund ? undefined : ttdToCents(refundAmountTtd);

  let refund: any;
  try {
    const lunipay = getLunipayClient();
    refund = await lunipay.payments.refund(
      payment.lunipay_payment_id,
      {
        amount: refundAmountCents,
        reason: 'requested_by_customer',
        metadata: {
          internal_payment_id: payment.id,
          refund_reason:       'admin_manual',
          refunded_by:         auth.user!.id,
          case_id:             caseId,
        },
      } as any,
      { idempotencyKey: `case-refund-${caseId}` }
    );
  } catch (err) {
    const isApiError = err instanceof LuniPayError;
    console.error('[POST /api/admin/payout-cases/:id/resolve] LuniPay refund failed:', err);
    return NextResponse.json(
      {
        error:  isApiError ? (err as LuniPayError).message : (err as Error).message,
        code:   'lunipay_refund_failed',
      },
      { status: 502 }
    );
  }

  // ── Update payments table ──────────────────────────────────────────────────
  const newTotalRefunded = +(alreadyRefunded + refundAmountTtd).toFixed(2);
  const newPaymentStatus = newTotalRefunded >= paymentAmountTtd - 0.005 ? 'refunded' : 'partially_refunded';

  if (!payment.is_subscription) {
    await admin
      .from('payments')
      .update({
        status:              newPaymentStatus,
        total_refunded_ttd:  newTotalRefunded,
      })
      .eq('id', payment.id);
  } else {
    await admin
      .from('subscription_payments')
      .update({ status: 'REFUNDED' })
      .eq('id', payment.id);
  }

  // ── Resolve payout case (ledger + case status, atomic) ────────────────────
  const { data: rpcResult, error: rpcError } = await (admin as any).rpc('resolve_payout_case', {
    p_case_id:             caseId,
    p_action:              action,
    p_refund_amount_ttd:   action === 'partial_refund' ? body.refund_amount_ttd : null,
    p_release_amount_ttd:  action === 'partial_refund' ? body.release_amount_ttd : null,
    p_admin_id:            auth.user!.id,
    p_admin_notes:         body.admin_notes ?? null,
  });

  if (rpcError) {
    console.error(
      '[POST /api/admin/payout-cases/:id/resolve] resolve_payout_case failed after LuniPay refund:',
      rpcError
    );
    return NextResponse.json({
      ok:                true,
      case_id:           caseId,
      action,
      refund_amount_ttd: refundAmountTtd,
      new_payment_status: newPaymentStatus,
      warning:           `refund_issued_db_sync_pending: ${rpcError.message}`,
    });
  }

  await notifyTutor(
    admin,
    payoutCase.tutor_id,
    action,
    ledger?.amount_ttd ?? 0,
    refundAmountTtd,
    body.release_amount_ttd,
  );

  return NextResponse.json({
    ok:                 true,
    case_id:            caseId,
    action,
    refund_amount_ttd:  refundAmountTtd,
    new_payment_status: newPaymentStatus,
    rpc:                rpcResult,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function notifyTutor(
  admin: any,
  tutorId: string,
  action: Action,
  heldAmountTtd: number,
  refundAmountTtd?: number,
  releaseAmountTtd?: number,
): Promise<void> {
  const held = Number(heldAmountTtd ?? 0);
  let title: string;
  let message: string;

  if (action === 'release_to_tutor') {
    title   = 'Held payout released';
    message = `Your held payout of TT$${held.toFixed(2)} has been released and is now pending.`;
  } else if (action === 'refund_student') {
    title   = 'Held payout reversed';
    message = `Your held payout of TT$${held.toFixed(2)} was reversed — the student has been refunded.`;
  } else {
    title   = 'Partial payout released';
    message = `TT$${Number(releaseAmountTtd ?? 0).toFixed(2)} of your held payout was released to your balance; TT$${Number(refundAmountTtd ?? 0).toFixed(2)} was refunded to the student.`;
  }

  try {
    await admin.from('notifications').insert({
      user_id: tutorId,
      type:    'payout_released',
      title,
      message,
      link:    '/tutor/wallet',
    });
  } catch (e) {
    console.warn('[resolve payout-case] notification insert failed:', e);
  }
}
