import { LuniPayError } from 'lunipay';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLunipayClient, ttdToCents } from '@/lib/payments/lunipayClient';

type AnyClient = SupabaseClient<any, 'public', 'public', any, any>;

export type SubscriptionRemovalRefundResult =
  | {
      ok: true;
      path: 'escrow_reversed' | 'released_deduction' | 'no_ledger';
      subscriptionPaymentId: string;
      refundAmountTtd: number;
      deductionAmountTtd: number;
      pendingDeductionTtd: number;
      lunipayRefundId: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      details?: unknown;
    };

interface RefundRemovedSubscriptionOptions {
  admin: AnyClient;
  subscriptionPaymentId: string;
  enrollmentId: string;
  groupId: string;
  removalId: string | null;
  tutorId: string;
  actorId: string;
}

const fail = (
  status: number,
  error: string,
  details?: unknown
): SubscriptionRemovalRefundResult => ({ ok: false, status, error, details });

export async function refundRemovedSubscription(
  opts: RefundRemovedSubscriptionOptions
): Promise<SubscriptionRemovalRefundResult> {
  const { admin } = opts;

  const { data: sp, error: spError } = await admin
    .from('subscription_payments')
    .select('id, enrollment_id, amount_ttd, lunipay_transaction_id, status')
    .eq('id', opts.subscriptionPaymentId)
    .maybeSingle();

  if (spError) return fail(500, spError.message, spError);
  if (!sp) return fail(404, 'Subscription payment not found');
  if (sp.status === 'REFUNDED') {
    return {
      ok: true,
      path: 'no_ledger',
      subscriptionPaymentId: sp.id,
      refundAmountTtd: Number(sp.amount_ttd ?? 0),
      deductionAmountTtd: 0,
      pendingDeductionTtd: 0,
      lunipayRefundId: null,
    };
  }
  if (sp.status !== 'PAID') {
    return fail(422, `Subscription payment is in '${sp.status}' state and cannot be refunded`);
  }
  if (!sp.lunipay_transaction_id) {
    return fail(422, 'No LuniPay transaction ID found for subscription payment');
  }

  const refundAmountTtd = Number(sp.amount_ttd ?? 0);
  if (!Number.isFinite(refundAmountTtd) || refundAmountTtd <= 0) {
    return fail(422, 'Subscription payment amount is invalid');
  }

  const { data: ledger } = await admin
    .from('payout_ledger')
    .select('id, status, batch_id, tutor_id, amount_ttd')
    .eq('subscription_payment_id', sp.id)
    .maybeSingle();

  let batchStatus: string | null = null;
  if (ledger?.batch_id) {
    const { data: batch } = await admin
      .from('payout_batches')
      .select('status, paid_at')
      .eq('id', ledger.batch_id)
      .maybeSingle();
    batchStatus = batch?.status ?? null;
  }

  const payoutReleased =
    ledger?.status === 'released' ||
    batchStatus === 'paid';

  let refund: any;
  try {
    const lunipay = getLunipayClient();
    refund = await lunipay.payments.refund(
      sp.lunipay_transaction_id,
      {
        amount: ttdToCents(refundAmountTtd),
        reason: 'requested_by_customer',
        metadata: {
          refund_reason: 'student_removal_refund',
          subscription_payment_id: sp.id,
          enrollment_id: opts.enrollmentId,
          group_id: opts.groupId,
          removal_id: opts.removalId,
          actor_id: opts.actorId,
          payout_released: payoutReleased,
        },
      } as any,
      { idempotencyKey: `student-removal-refund-${opts.removalId ?? sp.id}` }
    );
  } catch (err) {
    const msg = err instanceof LuniPayError ? err.message : (err as Error).message;
    await recordSubscriptionRefund(admin, {
      subscriptionPaymentId: sp.id,
      enrollmentId: opts.enrollmentId,
      removalId: opts.removalId,
      amountTtd: refundAmountTtd,
      status: 'failed',
      errorMessage: msg,
    });
    return fail(502, 'LuniPay refund failed', msg);
  }

  const now = new Date().toISOString();
  await recordSubscriptionRefund(admin, {
    subscriptionPaymentId: sp.id,
    enrollmentId: opts.enrollmentId,
    removalId: opts.removalId,
    amountTtd: refundAmountTtd,
    status: 'succeeded',
    lunipayRefundId: refund?.id ?? null,
  });

  const [spUpdate, enrollmentUpdate, removalUpdate] = await Promise.all([
    admin
      .from('subscription_payments')
      .update({ status: 'REFUNDED', refunded_at: now })
      .eq('id', sp.id),
    admin
      .from('group_enrollments')
      .update({ payment_status: 'REFUNDED', updated_at: now })
      .eq('id', opts.enrollmentId),
    opts.removalId
      ? admin
          .from('group_removals')
          .update({
            refund_issued: true,
            refund_amount_ttd: refundAmountTtd,
            resolved_at: now,
          })
          .eq('id', opts.removalId)
      : Promise.resolve({ error: null }),
  ]);

  const dbErrors = [spUpdate.error, enrollmentUpdate.error, removalUpdate.error].filter(Boolean);
  if (dbErrors.length > 0) {
    return fail(
      500,
      `Refund succeeded on LuniPay but DB sync failed: ${dbErrors.map((e: any) => e.message).join('; ')}`
    );
  }

  if (!payoutReleased) {
    if (ledger && ledger.status !== 'reversed') {
      const { error: reverseError } = await (admin as any).rpc('reverse_payout_ledger_row', {
        p_ledger_id: ledger.id,
        p_removal_id: opts.removalId,
        p_admin_id: opts.actorId,
        p_notes: 'Student removed from group; full monthly refund issued.',
      });
      if (reverseError) {
        return fail(
          500,
          `Refund succeeded but payout ledger reversal failed: ${reverseError.message}`,
          reverseError
        );
      }
    }

    return {
      ok: true,
      path: ledger ? 'escrow_reversed' : 'no_ledger',
      subscriptionPaymentId: sp.id,
      refundAmountTtd,
      deductionAmountTtd: 0,
      pendingDeductionTtd: 0,
      lunipayRefundId: refund?.id ?? null,
    };
  }

  const deduction = await createTutorDeduction(admin, {
    tutorId: opts.tutorId,
    amountTtd: refundAmountTtd,
    enrollmentId: opts.enrollmentId,
    subscriptionPaymentId: sp.id,
  });

  if (!deduction.ok) {
    return fail(500, deduction.error);
  }

  return {
    ok: true,
    path: 'released_deduction',
    subscriptionPaymentId: sp.id,
    refundAmountTtd,
    deductionAmountTtd: deduction.deductedNowTtd,
    pendingDeductionTtd: deduction.pendingTtd,
    lunipayRefundId: refund?.id ?? null,
  };
}

async function recordSubscriptionRefund(
  admin: AnyClient,
  args: {
    subscriptionPaymentId: string;
    enrollmentId: string;
    removalId: string | null;
    amountTtd: number;
    status: 'pending' | 'succeeded' | 'failed';
    lunipayRefundId?: string | null;
    errorMessage?: string | null;
  }
) {
  await admin.from('subscription_refunds').insert({
    subscription_payment_id: args.subscriptionPaymentId,
    enrollment_id: args.enrollmentId,
    group_removal_id: args.removalId,
    amount_ttd: args.amountTtd,
    status: args.status,
    lunipay_refund_id: args.lunipayRefundId ?? null,
    error_message: args.errorMessage ?? null,
    updated_at: new Date().toISOString(),
  });
}

async function createTutorDeduction(
  admin: AnyClient,
  args: {
    tutorId: string;
    amountTtd: number;
    enrollmentId: string;
    subscriptionPaymentId: string;
  }
): Promise<{ ok: true; deductedNowTtd: number; pendingTtd: number } | { ok: false; error: string }> {
  const amount = Math.round(args.amountTtd * 100) / 100;
  const { data: balance, error: balanceError } = await admin
    .from('tutor_balances')
    .select('tutor_id, available_ttd, pending_ttd')
    .eq('tutor_id', args.tutorId)
    .maybeSingle();

  if (balanceError) return { ok: false, error: balanceError.message };

  const available = Math.round(Number(balance?.available_ttd ?? 0) * 100) / 100;
  const deductedNow = Math.round(Math.min(available, amount) * 100) / 100;
  const pending = Math.round((amount - deductedNow) * 100) / 100;
  const now = new Date().toISOString();

  if (deductedNow > 0) {
    const { error: balanceUpdateError } = await admin
      .from('tutor_balances')
      .upsert(
        {
          tutor_id: args.tutorId,
          pending_ttd: Number(balance?.pending_ttd ?? 0),
          available_ttd: Math.round((available - deductedNow) * 100) / 100,
          last_updated: now,
        },
        { onConflict: 'tutor_id' }
      );

    if (balanceUpdateError) return { ok: false, error: balanceUpdateError.message };

    const { error: deductedInsertError } = await (admin as any)
      .from('tutor_deductions')
      .insert({
        tutor_id: args.tutorId,
        amount_ttd: deductedNow,
        reason: 'student_removal_refund',
        source_enrollment_id: args.enrollmentId,
        source_payment_id: null,
        source_subscription_payment_id: args.subscriptionPaymentId,
        status: 'deducted',
        resolved_at: now,
      });

    if (deductedInsertError) return { ok: false, error: deductedInsertError.message };
  }

  if (pending > 0) {
    const { error: pendingInsertError } = await (admin as any)
      .from('tutor_deductions')
      .insert({
        tutor_id: args.tutorId,
        amount_ttd: pending,
        reason: 'student_removal_refund',
        source_enrollment_id: args.enrollmentId,
        source_payment_id: null,
        source_subscription_payment_id: args.subscriptionPaymentId,
        status: 'pending',
      });

    if (pendingInsertError) return { ok: false, error: pendingInsertError.message };
  }

  return { ok: true, deductedNowTtd: deductedNow, pendingTtd: pending };
}

