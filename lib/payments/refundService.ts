// =====================================================
// REFUND SERVICE
// =====================================================
// One function consumed by every refund-issuing route:
//   - Admin manual refund          → /api/admin/payments/[id]/refund
//   - Booking cancellation refund  → /api/bookings/[id]/cancel
//   - Admin no-show resolution     → /api/admin/noshow/[id]/resolve
//
// Owns:
//   1. Pre-flight: load payment, validate cumulative refund stays
//      within the original charge, block if the matching
//      payout_ledger row has advanced past 'owed'.
//   2. LuniPay: refund the requested amount with a per-refund
//      idempotency key so multiple partial refunds against the
//      same payment all succeed.
//   3. Atomic side-effects: hand the LuniPay refund object plus
//      the retained-share commission split to
//      apply_refund_side_effects(jsonb) so payments + ledger +
//      tutor_balances + sessions either all move or none do.
//   4. Notifications: payment_refunded to the payer (always),
//      booking_cancelled to the tutor when payout drops to zero.
//
// Out of scope: building the cancellation_events / noshow_claims
// audit trail; rolling counters; rating penalties. Those layer on
// top of this primitive.
// =====================================================

import { LuniPayError } from 'lunipay';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server';
import { getLunipayClient, ttdToCents } from '@/lib/payments/lunipayClient';
import { calculateCommission } from '@/lib/utils/commissionCalculator';
import { recordCreditRefund, type CreditRefundScenario } from '@/lib/payments/creditRefundService';

// ── TEMPORARY: LuniPay refund API is broken ──────────────────────────────────
// All refunds are recorded as credit liabilities in credit_refund_liabilities
// instead of being processed through LuniPay. Set this to false once LuniPay
// fixes their refund API and the credit system is live.
const REFUND_AS_CREDITS = true;

type AnyClient = SupabaseClient<any, 'public', 'public', any, any>;

export type RefundReason =
  | 'student_cancelled'
  | 'tutor_cancelled'
  | 'tutor_noshow'
  | 'tie_inconclusive'
  | 'slot_conflict'
  | 'student_late_cancel'
  | 'student_noshow'
  | 'admin_manual';

export type RefundFailureCode =
  | 'payment_not_found'
  | 'payment_not_refundable'
  | 'over_refund'
  | 'ledger_already_advanced'
  | 'lunipay_refund_failed'
  | 'side_effects_failed'
  | 'invalid_arguments';

export interface RefundFailure {
  ok: false;
  code: RefundFailureCode;
  status: number; // suggested HTTP status for the route to surface
  message: string;
  details?: unknown;
}

export interface RefundSuccess {
  ok: true;
  paymentId: string;
  newPaymentStatus: 'refunded' | 'partially_refunded';
  ledgerAction: 'reverted' | 'replaced' | 'inserted' | 'no_session';
  refundAmountTtd: number;
  retainedAmountTtd: number;
  totalRefundedTtd: number;
  refund: any; // raw LuniPay refund object
  warning?: string;
}

export type RefundResult = RefundSuccess | RefundFailure;

export interface RefundOptions {
  paymentId: string;
  reason: RefundReason;
  /** Omit for full refund. */
  refundAmountTtd?: number;
  /** Set together with a non-full refundAmountTtd for partial-retention flows. */
  retainedAmountTtd?: number;
  /** User id of the actor (admin, system caller, cancelling user). */
  actorId: string;
  /**
   * Optional override for sessions.status. Examples:
   *   'NO_SHOW_STUDENT' | 'NO_SHOW_TUTOR' | 'MUTUAL_NON_COMPLETION'.
   * If omitted and refund is full + no ledger row exists, the RPC
   * defaults the session to 'CANCELLED' so the cron skips it.
   */
  sessionStatusOverride?: string;
  /** Pass an existing service-role client (e.g. from a route) to reuse it. */
  client?: AnyClient;
}

const fail = (
  code: RefundFailureCode,
  status: number,
  message: string,
  details?: unknown
): RefundFailure => ({ ok: false, code, status, message, details });

export async function refundPayment(opts: RefundOptions): Promise<RefundResult> {
  const admin: AnyClient = opts.client ?? getServiceClient();

  if (!opts.paymentId) {
    return fail('invalid_arguments', 400, 'paymentId is required');
  }
  if (opts.refundAmountTtd !== undefined && (!Number.isFinite(opts.refundAmountTtd) || opts.refundAmountTtd <= 0)) {
    return fail('invalid_arguments', 400, 'refundAmountTtd must be a positive number when provided');
  }
  if (opts.retainedAmountTtd !== undefined && (!Number.isFinite(opts.retainedAmountTtd) || opts.retainedAmountTtd < 0)) {
    return fail('invalid_arguments', 400, 'retainedAmountTtd must be a non-negative number when provided');
  }

  // ---- 1. Load payment ------------------------------------------------
  const { data: payment, error: lookupError } = await admin
    .from('payments')
    .select(
      'id, status, amount_ttd, total_refunded_ttd, payer_id, booking_id, lunipay_payment_id, lunipay_payment_intent_id, raw_provider_payload'
    )
    .eq('id', opts.paymentId)
    .maybeSingle();

  if (lookupError) {
    return fail('payment_not_found', 500, lookupError.message, lookupError);
  }
  if (!payment) {
    return fail('payment_not_found', 404, `Payment ${opts.paymentId} not found`);
  }
  // LuniPay live API has a known bug: payment_id is null even after a
  // successful charge (status returns OPEN). When this happens we skip
  // the LuniPay API refund call and flag it for manual processing from
  // the LuniPay dashboard. The booking cancellation still proceeds.
  const needsManualRefund = !payment.lunipay_payment_id;
  if (!['succeeded', 'partially_refunded'].includes(payment.status)) {
    return fail(
      'payment_not_refundable',
      400,
      `Cannot refund a payment in status '${payment.status}'`
    );
  }

  const amountTtd = Number(payment.amount_ttd ?? 0);
  const alreadyRefunded = Number(payment.total_refunded_ttd ?? 0);
  const remaining = +(amountTtd - alreadyRefunded).toFixed(2);

  if (remaining <= 0) {
    return fail('over_refund', 409, 'Payment is already fully refunded');
  }

  const refundAmountTtd =
    opts.refundAmountTtd !== undefined ? +opts.refundAmountTtd.toFixed(2) : remaining;
  const retainedAmountTtd = +(opts.retainedAmountTtd ?? 0).toFixed(2);

  // Cumulative refund cannot exceed the original charge.
  if (alreadyRefunded + refundAmountTtd > amountTtd + 0.005) {
    return fail(
      'over_refund',
      400,
      `Cumulative refund TT$${(alreadyRefunded + refundAmountTtd).toFixed(2)} would exceed payment amount TT$${amountTtd.toFixed(2)}`
    );
  }

  // Refund + retained must reconcile against the original charge.
  if (retainedAmountTtd > 0 && refundAmountTtd + retainedAmountTtd > amountTtd + 0.005) {
    return fail(
      'invalid_arguments',
      400,
      `refundAmountTtd + retainedAmountTtd (${(refundAmountTtd + retainedAmountTtd).toFixed(2)}) exceeds payment amount ${amountTtd.toFixed(2)}`
    );
  }

  // ---- 2. Pre-flight: ledger past 'owed'? ----------------------------
  if (payment.booking_id) {
    const { data: sessionRow } = await admin
      .from('sessions')
      .select('id, tutor_id, status')
      .eq('booking_id', payment.booking_id)
      .maybeSingle();

    if (sessionRow?.id) {
      const { data: ledgerRow } = await admin
        .from('payout_ledger')
        .select('id, status')
        .eq('session_id', sessionRow.id)
        .maybeSingle();

      if (ledgerRow && ['release_ready', 'released'].includes(ledgerRow.status)) {
        return fail(
          'ledger_already_advanced',
          409,
          `Cannot refund: tutor payout for this session is already in '${ledgerRow.status}'. Reverse the payout manually first.`
        );
      }
    }
  }

  // ---- CREDIT BYPASS (TEMPORARY) ------------------------------------
  // LuniPay refund API is currently broken. Record a credit liability
  // instead of attempting a real refund. Remove when fixed.
  if (REFUND_AS_CREDITS) {
    const scenarioMap: Record<string, CreditRefundScenario> = {
      student_cancelled: 'student_cancelled',
      student_late_cancel: 'student_late_cancel',
      tutor_cancelled: 'tutor_cancelled',
      tutor_noshow: 'noshow_tutor',
      tie_inconclusive: 'noshow_tie',
      slot_conflict: 'slot_conflict',
      admin_manual: 'admin_manual',
      student_noshow: 'student_cancelled',
    };
    const scenario: CreditRefundScenario = scenarioMap[opts.reason] ?? 'admin_manual';

    // For late student cancel: student gets credit_amount, tutor gets cash payout.
    const tutorCashPayoutTtd = opts.reason === 'student_late_cancel' ? retainedAmountTtd : 0;

    const creditResult = await recordCreditRefund({
      admin,
      userId: payment.payer_id,
      userRole: 'student',
      scenario,
      reason: opts.reason,
      creditAmountTtd: refundAmountTtd,
      originalAmountTtd: amountTtd,
      tutorCashPayoutTtd,
      bookingId: payment.booking_id ?? null,
      originalPaymentId: payment.id,
      originalLunipayTransactionId: payment.lunipay_payment_id ?? null,
      metadata: { actor_id: opts.actorId, session_status_override: opts.sessionStatusOverride },
    });

    if (!creditResult.ok) {
      return fail('side_effects_failed', 500, creditResult.message);
    }

    // Mark payment as refunded in our DB so the booking can cancel cleanly.
    const newStatus = refundAmountTtd >= remaining ? 'refunded' : 'partially_refunded';
    await admin.from('payments').update({
      status: newStatus,
      total_refunded_ttd: +(alreadyRefunded + refundAmountTtd).toFixed(2),
      cancel_reason: opts.reason,
      updated_at: new Date().toISOString(),
    }).eq('id', payment.id);

    // Apply session/ledger side-effects via RPC (without the LuniPay refund object).
    const rpcPayload: Record<string, unknown> = {
      payment_id: payment.id,
      refund_amount_ttd: refundAmountTtd,
      retained_amount_ttd: retainedAmountTtd,
      retained_payout_ttd: tutorCashPayoutTtd,
      retained_platform_fee_ttd: 0,
      reason: opts.reason,
      refund_payload: { credit_liability_id: creditResult.liabilityId, credits_only: true },
    };
    if (opts.sessionStatusOverride) {
      rpcPayload.session_status_override = opts.sessionStatusOverride;
    }
    const { error: rpcError } = await admin.rpc('apply_refund_side_effects', { p_payload: rpcPayload });
    if (rpcError) {
      console.warn('[refundService] apply_refund_side_effects warning (credits path):', rpcError.message);
    }

    return {
      ok: true,
      paymentId: payment.id,
      newPaymentStatus: newStatus,
      ledgerAction: 'no_session',
      refundAmountTtd,
      retainedAmountTtd,
      totalRefundedTtd: +(alreadyRefunded + refundAmountTtd).toFixed(2),
      refund: { credit_liability_id: creditResult.liabilityId, credits_only: true },
    };
  }
  // ---- END CREDIT BYPASS --------------------------------------------

  // ---- 3. Compute commission split for retained share ----------------
  let retainedPayoutTtd = 0;
  let retainedPlatformFeeTtd = 0;
  if (retainedAmountTtd > 0) {
    const { platformFee, payoutAmount } = calculateCommission(retainedAmountTtd);
    retainedPlatformFeeTtd = platformFee;
    retainedPayoutTtd = payoutAmount;
  }

  // ---- 4. Build per-refund idempotency key ---------------------------
  // Existing route used `refund-${payment.id}` which means LuniPay
  // returns the cached first refund on every subsequent call. For
  // multiple partial refunds we need a unique key per call.
  const priorRefunds = Array.isArray((payment.raw_provider_payload as any)?.refunds)
    ? ((payment.raw_provider_payload as any).refunds as unknown[]).length
    : 0;
  const idempotencyKey = `refund-${payment.id}-${priorRefunds + 1}`;

  // ---- 5. LuniPay call ------------------------------------------------
  // Skip if payment_id is null (LuniPay live bug — card charged but API
  // returns OPEN). The cancellation proceeds; admin must refund manually
  // from the LuniPay dashboard.
  const isFullRefund = Math.abs(refundAmountTtd - remaining) < 0.005;
  const refundAmountCents = isFullRefund ? undefined : ttdToCents(refundAmountTtd);

  let refund: any = needsManualRefund ? { manual_refund_required: true } : null;
  if (!needsManualRefund) {
    try {
      const lunipay = getLunipayClient();
      refund = await lunipay.payments.refund(
        payment.lunipay_payment_id,
        {
          amount: refundAmountCents,
          reason: 'requested_by_customer',
          metadata: {
            internal_payment_id: payment.id,
            refund_reason: opts.reason,
            refunded_by: opts.actorId,
            retained_amount_ttd: retainedAmountTtd,
          },
        } as any,
        { idempotencyKey }
      );
    } catch (err) {
      const isApiError = err instanceof LuniPayError;
      console.error('[refundService] LuniPay refund failed:', err);
      return fail(
        'lunipay_refund_failed',
        502,
        isApiError ? (err as LuniPayError).message : (err as Error).message,
        { code: isApiError ? (err as LuniPayError).code : undefined }
      );
    }
  }

  // ---- 6. Atomic side effects via RPC --------------------------------
  const rpcPayload: Record<string, unknown> = {
    payment_id: payment.id,
    refund_amount_ttd: refundAmountTtd,
    retained_amount_ttd: retainedAmountTtd,
    retained_payout_ttd: retainedPayoutTtd,
    retained_platform_fee_ttd: retainedPlatformFeeTtd,
    reason: opts.reason,
    refund_payload: refund,
  };
  if (opts.sessionStatusOverride) {
    rpcPayload.session_status_override = opts.sessionStatusOverride;
  }

  const { data: rpcResult, error: rpcError } = await admin.rpc('apply_refund_side_effects', {
    p_payload: rpcPayload,
  });

  if (rpcError) {
    console.error('[refundService] apply_refund_side_effects failed:', rpcError);
    // LuniPay refund already succeeded — return success-with-warning so
    // the caller / operator can reconcile, instead of pretending the
    // money is still on the card.
    return {
      ok: true,
      paymentId: payment.id,
      newPaymentStatus: 'partially_refunded',
      ledgerAction: 'no_session',
      refundAmountTtd,
      retainedAmountTtd,
      totalRefundedTtd: alreadyRefunded + refundAmountTtd,
      refund,
      warning: `Refund succeeded on LuniPay but DB side-effects failed: ${rpcError.message}`,
    };
  }

  const rpc = (rpcResult ?? {}) as Record<string, any>;
  const newPaymentStatus: 'refunded' | 'partially_refunded' =
    rpc.new_payment_status === 'refunded' ? 'refunded' : 'partially_refunded';
  const totalRefundedTtd = Number(rpc.total_refunded_ttd ?? alreadyRefunded + refundAmountTtd);
  const ledgerAction =
    (rpc.ledger_action as RefundSuccess['ledgerAction']) ?? 'no_session';

  // ---- 7. Notifications ---------------------------------------------
  await sendNotifications(admin, {
    payerId: payment.payer_id,
    tutorId: rpc.tutor_id ?? null,
    refundAmountTtd,
    isFullRefund: newPaymentStatus === 'refunded',
    retainedAmountTtd,
    reason: opts.reason,
  });

  return {
    ok: true,
    paymentId: payment.id,
    newPaymentStatus,
    ledgerAction,
    refundAmountTtd,
    retainedAmountTtd,
    totalRefundedTtd,
    refund,
  };
}

async function sendNotifications(
  admin: AnyClient,
  args: {
    payerId: string | null;
    tutorId: string | null;
    refundAmountTtd: number;
    isFullRefund: boolean;
    retainedAmountTtd: number;
    reason: RefundReason;
  }
): Promise<void> {
  const rows: Array<Record<string, unknown>> = [];

  if (args.payerId) {
    const refundLine = args.isFullRefund
      ? `A refund of TT$${args.refundAmountTtd.toFixed(2)} has been issued.`
      : `A partial refund of TT$${args.refundAmountTtd.toFixed(2)} has been issued (TT$${args.retainedAmountTtd.toFixed(2)} retained per policy).`;
    rows.push({
      user_id: args.payerId,
      type: 'payment_refunded',
      title: args.isFullRefund ? 'Refund issued' : 'Partial refund issued',
      message: `${refundLine} It will appear on your card within a few business days.`,
      link: '/student/bookings',
      created_at: new Date().toISOString(),
    });
  }

  if (args.tutorId) {
    // Only ping the tutor when the booking is fully cancelled from
    // their POV. For partial-retention they still get paid out, so a
    // generic "cancelled" notification would be misleading.
    if (args.isFullRefund && args.retainedAmountTtd === 0) {
      rows.push({
        user_id: args.tutorId,
        type: 'booking_cancelled',
        title: 'Session cancelled',
        message: `A session has been cancelled (${humanReason(args.reason)}). No payout for this session.`,
        link: '/tutor/bookings',
        created_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length === 0) return;

  const { error } = await admin.from('notifications').insert(rows);
  if (error) {
    // Notifications are best-effort — never block the refund.
    console.warn('[refundService] notification insert failed:', error.message);
  }
}

function humanReason(reason: RefundReason): string {
  switch (reason) {
    case 'student_cancelled':    return 'student cancelled';
    case 'tutor_cancelled':      return 'tutor cancelled';
    case 'tutor_noshow':         return 'tutor no-show';
    case 'tie_inconclusive':     return 'no-show inconclusive';
    case 'slot_conflict':        return 'slot conflict';
    case 'student_late_cancel':  return 'late cancellation';
    case 'student_noshow':       return 'student no-show';
    case 'admin_manual':         return 'admin action';
  }
}
