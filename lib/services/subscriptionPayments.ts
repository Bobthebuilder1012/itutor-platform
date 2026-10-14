// =====================================================
// SUBSCRIPTION PAYMENT SERVICE
// =====================================================
// Shared helpers for creating, activating, and failing
// subscription_payments rows. Used by subscribe, renew,
// reactivate, webhook, and finalize routes.
// =====================================================

import { type SupabaseClient } from '@supabase/supabase-js';
import { calculateCommissionForTutor } from '@/lib/utils/commissionCalculator';
import type { SubscriptionPaymentType } from '@/lib/types/groups';
import { trackForUser } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import { recordQualifyingPayment } from '@/lib/credits/qualifyingPayment';
import { withOptionalCredits } from '@/lib/credits/cash';
import { commitCredits, releaseCredits, safely } from '@/lib/credits/wallet';

export interface CreatePendingPaymentParams {
  enrollmentId: string;
  groupId: string;
  studentId: string;
  type: SubscriptionPaymentType;
  amountTtd: number;
  originalAmountTtd?: number | null;
  discountPercent?: number | null;
  promotionId?: string | null;
  /** Who is charged, when that is not the student. Omitted = the student pays.
   *  Recorded so a refund and a receipt reach the card that was actually used. */
  payerId?: string | null;
}

export interface PendingPaymentRow {
  id: string;
  enrollment_id: string;
  group_id: string;
  student_id: string;
  type: SubscriptionPaymentType;
  amount_ttd: number;
  platform_fee_ttd: number;
  tutor_payout_ttd: number;
  status: string;
  checkout_expires_at: string;
  created_at: string;
}

const CHECKOUT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export async function createPendingSubscriptionPayment(
  admin: SupabaseClient,
  params: CreatePendingPaymentParams
): Promise<PendingPaymentRow> {
  // Honor the group tutor's per-tutor / global commission override.
  const { data: grp } = await admin
    .from('groups')
    .select('tutor_id')
    .eq('id', params.groupId)
    .maybeSingle();
  const { platformFee, payoutAmount } = await calculateCommissionForTutor(
    admin,
    (grp as any)?.tutor_id ?? null,
    params.amountTtd
  );
  const checkoutExpiresAt = new Date(Date.now() + CHECKOUT_WINDOW_MS).toISOString();

  const { data, error } = await admin
    .from('subscription_payments')
    .insert({
      enrollment_id: params.enrollmentId,
      group_id: params.groupId,
      student_id: params.studentId,
      payer_id:
        params.payerId && params.payerId !== params.studentId ? params.payerId : null,
      type: params.type,
      amount_ttd: params.amountTtd,
      original_amount_ttd: params.originalAmountTtd ?? null,
      discount_percent: params.discountPercent ?? null,
      promotion_id: params.promotionId ?? null,
      platform_fee_ttd: platformFee,
      tutor_payout_ttd: payoutAmount,
      status: 'PENDING',
      checkout_expires_at: checkoutExpiresAt,
    })
    .select()
    .single();

  if (error) throw error;
  return data as PendingPaymentRow;
}

export async function expireSubscriptionPayment(
  admin: SupabaseClient,
  paymentId: string
): Promise<void> {
  const { error } = await admin
    .from('subscription_payments')
    .update({ status: 'expired' })
    .eq('id', paymentId)
    .eq('status', 'PENDING');

  if (error) throw error;

  // Credits reserved for this payment go back — unless they travel on a
  // Stripe coupon, whose invoice might still be paid (a stale tab). Those are
  // released by whoever cancels that subscription, or by the nightly job once
  // Stripe has given up on it. Never throws.
  try {
    const { data: row } = await admin
      .from('subscription_payments')
      .select('credit_spend_id')
      .eq('id', paymentId)
      .maybeSingle();
    const spendId = (row as { credit_spend_id?: string | null } | null)?.credit_spend_id;
    if (spendId) {
      const { data: spend } = await admin
        .from('credit_ledger')
        .select('stripe_coupon_id')
        .eq('id', spendId)
        .maybeSingle();
      if (!spend?.stripe_coupon_id) {
        await safely('release expired checkout', () => releaseCredits(admin, spendId));
      }
    }
  } catch {
    // credit_spend_id absent before migration 268: nothing was reserved.
  }
}

export interface HandleSubscriptionPaymentParams {
  admin: SupabaseClient;
  subscriptionPaymentId: string;
  /**
   * Provider reference. Exactly one of these is set depending on which
   * gateway took the money — Stripe for new subscriptions, LuniPay for
   * ones started before the migration. They're written to separate
   * columns so the provider stays legible from the row.
   */
  lunipaySessionId?: string | null;
  lunipayTransactionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  receiptUrl?: string | null;
  /** 'credits': a credit month paid entirely with credits — no gateway at all. */
  source: 'webhook' | 'finalize' | 'credits';
}

export interface SubscriptionReceipt {
  amountTtd: number;
  groupName: string;
  periodStart: string;
  periodEnd: string;
  paymentId: string;
  paidAt: string;
}

export interface HandleSubscriptionPaymentResult {
  ok: boolean;
  idempotent?: boolean;
  enrollmentId?: string;
  error?: string;
  exceptionId?: string;
  receipt?: SubscriptionReceipt;
}

export async function handleSubscriptionPayment(
  params: HandleSubscriptionPaymentParams
): Promise<HandleSubscriptionPaymentResult> {
  const {
    admin,
    subscriptionPaymentId,
    lunipaySessionId,
    lunipayTransactionId,
    stripePaymentIntentId,
    stripeChargeId,
    receiptUrl,
    source,
  } = params;

  // Fetch the subscription_payment row + enrollment + group. credit_spend_id
  // arrives with migration 268, so the select retries without it.
  const { data: sp, error: spErr } = await withOptionalCredits((on) =>
    admin
      .from('subscription_payments')
      .select(`
        id, enrollment_id, group_id, student_id, payer_id, type,
        amount_ttd, platform_fee_ttd, tutor_payout_ttd,
        status, checkout_expires_at, period_start, period_end${on ? ', credit_spend_id' : ''},
        enrollment:group_enrollments!enrollment_id (
          id, status, payment_status, current_period_end,
          pending_payment_expires_at, group_id, billing_provider,
          group:groups!group_id (
            tutor_id, grace_period_days, max_students, name, subject
          )
        )
      `)
      .eq('id', subscriptionPaymentId)
      .single()
  );

  if (spErr || !sp) {
    console.error(`[handleSubscriptionPayment] Payment not found: ${subscriptionPaymentId}`, spErr);
    return { ok: false, error: 'subscription_payment_not_found' };
  }

  // Credits reserved for this payment are spent now — the money (or, for a
  // credit month, the decision) is confirmed. BEFORE activation and on the
  // replay path too: if activation then fails the discount has still been
  // used, and a commit that failed once must be retried by the redelivery.
  // Idempotent; never throws (the nightly job retries a failure).
  if (sp.credit_spend_id) {
    await safely('commit credits', () => commitCredits(admin, sp.credit_spend_id, sp.id));
  }

  // Idempotency: already activated
  if (sp.status === 'PAID') {
    const group = (sp as any).enrollment?.group as any;
    return {
      ok: true, idempotent: true, enrollmentId: sp.enrollment_id,
      receipt: {
        amountTtd: sp.amount_ttd,
        groupName: group?.name ?? '',
        periodStart: sp.period_start ?? '',
        periodEnd: sp.period_end ?? '',
        paymentId: sp.id,
        paidAt: new Date().toISOString(),
      },
    };
  }

  const enrollment = sp.enrollment as any;
  if (!enrollment) {
    return { ok: false, error: 'enrollment_not_found' };
  }

  // Store the provider reference on the payment row (non-blocking metadata).
  // Only the keys for the gateway that actually took the money are written,
  // so a Stripe payment never leaves ids in lunipay_* columns.
  const providerRefs: Record<string, unknown> = { receipt_url: receiptUrl ?? null };
  if (lunipaySessionId) {
    providerRefs.lunipay_checkout_session_id = lunipaySessionId;
    providerRefs.lunipay_transaction_id = lunipayTransactionId ?? null;
  }
  if (stripePaymentIntentId) {
    providerRefs.stripe_payment_intent_id = stripePaymentIntentId;
    providerRefs.stripe_charge_id = stripeChargeId ?? null;
  }

  await admin
    .from('subscription_payments')
    .update(providerRefs)
    .eq('id', subscriptionPaymentId);

  // Calculate period dates
  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;

  if (sp.type === 'subscription_initial' && enrollment.status === 'ACTIVE') {
    // A month bought with credits, now continuing as a subscription — the only
    // way an ACTIVE enrolment receives an initial payment. The first paid month
    // starts when the credit month ends, so the student is not charged again
    // for days credits already covered.
    //
    // A SECURED spot continuing is deliberately not in here: on this branch it
    // still bills from `now`, as it did before credits arrived. Moving it is a
    // billing change, and it belongs with the secure-spot work, not this port.
    const heldEnd = enrollment.current_period_end ? new Date(enrollment.current_period_end) : now;
    periodStart = heldEnd > now ? heldEnd : now;
    periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else if (sp.type === 'credit_month') {
    // One month from now, bought with credits. Never renews: the
    // process-subscriptions cron completes it when this period ends.
    periodStart = now;
    periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else if (sp.type === 'subscription_initial') {
    periodStart = now;
    periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else if (sp.type === 'subscription_renewal') {
    // Late payers don't get charged for missed days: period starts at max(now, current_period_end)
    const currentEnd = enrollment.current_period_end ? new Date(enrollment.current_period_end) : now;
    periodStart = currentEnd > now ? currentEnd : now;
    periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else {
    // reactivation: start fresh from now
    periodStart = now;
    periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  // Recalculate commission with final amount (in case it changed),
  // honoring the tutor's per-tutor / global commission override.
  const tutorIdForCommission = (enrollment.group as any)?.tutor_id ?? null;
  const { platformFee, payoutAmount } = await calculateCommissionForTutor(
    admin,
    tutorIdForCommission,
    sp.amount_ttd
  );

  // Always re-check capacity for initial subscriptions at activation time.
  // Guards the TOCTOU race where two students complete checkout simultaneously
  // against the last remaining slot. A credit month takes a seat the same way.
  // (The count leaves out this student's own row, so a continuing student is
  // never counted against their own seat.)
  if (sp.type === 'subscription_initial' || sp.type === 'credit_month') {
    const group = enrollment.group as any;
    if (group?.max_students) {
      const { count } = await admin
        .from('group_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', sp.group_id)
        .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED'])
        .neq('id', sp.enrollment_id);

      const { count: pendingCount } = await admin
        .from('group_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', sp.group_id)
        .eq('status', 'PENDING_PAYMENT')
        .gt('pending_payment_expires_at', now.toISOString())
        .neq('id', sp.enrollment_id);

      const used = (count ?? 0) + (pendingCount ?? 0);
      if (used >= group.max_students) {
        await markActivationFailed(admin, sp, enrollment, 'capacity_conflict', 'Group reached capacity while payment was processing');
        return { ok: false, error: 'capacity_conflict' };
      }
    }
  }

  // Call activate_subscription RPC (idempotent, transactional)
  const { data: rpcResult, error: rpcError } = await admin.rpc('activate_subscription', {
    p_payload: {
      subscription_payment_id: subscriptionPaymentId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      amount_ttd: sp.amount_ttd,
      platform_fee_ttd: platformFee,
      tutor_payout_ttd: payoutAmount,
    },
  });

  if (rpcError || !(rpcResult as any)?.ok) {
    const errorMsg = rpcError?.message ?? (rpcResult as any)?.error ?? 'rpc_failed';
    console.error(`[handleSubscriptionPayment] activate_subscription failed:`, rpcError ?? rpcResult);

    await markActivationFailed(admin, sp, enrollment, 'activation_failed', errorMsg);
    return { ok: false, error: errorMsg };
  }

  // Explicitly mark subscription_payment as PAID (defensive — RPC should do this
  // but we ensure it regardless so the tutor wallet reflects the payment).
  await admin
    .from('subscription_payments')
    .update({
      status: 'PAID',
      paid_at: now.toISOString(),
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    })
    .eq('id', subscriptionPaymentId)
    .neq('status', 'PAID'); // no-op if already set

  // A credit month just converted to a paid subscription: from now on Stripe
  // bills it. Left as 'credits' until this moment so an abandoned checkout
  // could not strand the month as a Stripe enrolment Stripe never bills.
  if (sp.type === 'subscription_initial' && enrollment.billing_provider === 'credits') {
    await admin
      .from('group_enrollments')
      .update({ billing_provider: 'stripe' })
      .eq('id', sp.enrollment_id)
      .eq('billing_provider', 'credits');
  }

  const group = (enrollment as any).group as any;
  const receipt: SubscriptionReceipt = {
    amountTtd: sp.amount_ttd,
    groupName: group?.name ?? '',
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    paymentId: sp.id,
    paidAt: now.toISOString(),
  };

  // Ensure group_members row is approved
  await admin
    .from('group_members')
    .upsert(
      { group_id: sp.group_id, user_id: sp.student_id, status: 'approved' },
      { onConflict: 'group_id,user_id', ignoreDuplicates: false }
    );

  // Notify student
  await admin.from('notifications').insert({
    user_id: sp.student_id,
    type: 'subscription_payment_succeeded',
    title: 'Subscription activated',
    message: `Your subscription has been activated. Access runs until ${periodEnd.toLocaleDateString('en-TT')}.`,
    link: `/student/subscriptions`,
    group_id: sp.group_id,
    metadata: { enrollment_id: sp.enrollment_id, subscription_payment_id: subscriptionPaymentId },
  }).then(({ error: ne }) => {
    if (ne) console.warn('[handleSubscriptionPayment] notification insert failed:', ne);
  });

  // Notify the TUTOR that a student joined. Placed here rather than in the
  // Stripe webhook so LuniPay-billed classes get it too — activation is the
  // one point both providers pass through.
  //
  // Only on the FIRST cycle: a renewal isn't someone joining, and a tutor
  // doesn't want "X joined your class" once a month forever.
  if (
    (sp.type === 'subscription_initial' && enrollment.status !== 'ACTIVE') ||
    sp.type === 'subscription_reactivation' ||
    sp.type === 'credit_month'
  ) {
    const group = (sp as any).enrollment?.group;
    const tutorId = group?.tutor_id;
    if (tutorId) {
      const { data: studentProfile } = await admin
        .from('profiles')
        .select('full_name, display_name')
        .eq('id', sp.student_id)
        .maybeSingle();
      const studentName =
        (studentProfile as any)?.display_name ||
        (studentProfile as any)?.full_name ||
        'A student';
      const className = group?.name ?? 'your class';

      const { error: tutorNotifyError } = await admin.from('notifications').insert({
        user_id: tutorId,
        type: 'new_class_member',
        title: `${studentName} joined ${className}`,
        message: `${studentName} has joined "${className}" and their payment has cleared.`,
        link: `/tutor/classes/${sp.group_id}?tab=roster`,
        group_id: sp.group_id,
        metadata: { enrollment_id: sp.enrollment_id, student_id: sp.student_id },
      });
      if (tutorNotifyError) {
        console.warn(
          '[handleSubscriptionPayment] tutor notification failed:',
          tutorNotifyError
        );
      }
    }
  }

  // ── paid ──
  // The single revenue event for the subscription path. Emitted HERE rather
  // than in the three webhook branches that call this function, because those
  // branches differ per provider and per event type — instrumenting them
  // separately is how one of them silently stops counting after a refactor.
  // Every successful activation passes through this line.
  //
  // Placed after activation, not before: `paid` is meant to mean "the student
  // got access", and emitting it earlier would count money taken on a seat the
  // activation RPC then refused.
  //
  // The idempotency branch near the top returns before reaching this, and
  // sp.id dedupes whatever that misses — one subscription_payments row is one
  // payment, however many times Stripe delivers it.
  await trackForUser(
    PRODUCT_EVENTS.PAID,
    { group_id: sp.group_id, amount: Number(sp.amount_ttd) || 0 },
    { userId: sp.student_id, dedupeKey: 'sub:' + sp.id }
  );

  // ── class_joined ──
  // Same placement and the same reasoning as `paid` above, with one extra
  // condition: a renewal is not a join. Without the type guard every monthly
  // charge would re-announce the student as newly joined, and the activation
  // ladder would treat a long-standing subscriber as someone who just started.
  if (sp.type === 'subscription_initial' || sp.type === 'subscription_reactivation') {
    await trackForUser(
      PRODUCT_EVENTS.CLASS_JOINED,
      {
        group_id: sp.group_id,
        class_name: group?.name ?? null,
        tutor_id: group?.tutor_id ?? null,
        tutor_name: null,
        joined_at: new Date().toISOString(),
        subject: group?.subject ?? null,
        membership: 'enrolled',
        seat_source: 'subscription',
        is_paid: true,
        ...(sp.payer_id && sp.payer_id !== sp.student_id
          ? { on_behalf_of: sp.payer_id as string }
          : {}),
      },
      { userId: sp.student_id, dedupeKey: `join:${sp.group_id}:${sp.student_id}` }
    );

    // No syncProfileNow here. This runs inside a Stripe/LuniPay webhook with a
    // provider deadline and redelivery semantics, and the enrolment's
    // updated_at already moves the activation watermark — so the reconciler
    // picks the new counters up within five minutes. The campaign that matters
    // is triggered by the event above, not by the attribute.
  }

  // Referral conversion, next to `paid` for the same reason: only a payment
  // that actually got the student a seat can earn their friend a reward.
  // Card payments only; never throws (lib/credits/qualifyingPayment.ts).
  await recordQualifyingPayment(admin, sp.id);

  return { ok: true, enrollmentId: sp.enrollment_id, receipt };
}

async function markActivationFailed(
  admin: SupabaseClient,
  sp: any,
  enrollment: any,
  exceptionType: string,
  errorMsg: string
): Promise<void> {
  const enrollmentStatus: string = enrollment.status;

  // Mark the subscription_payment as ACTIVATION_FAILED
  await admin
    .from('subscription_payments')
    .update({ status: 'ACTIVATION_FAILED', activation_status: 'failed', activation_error: errorMsg })
    .eq('id', sp.id);

  // Type-specific enrollment mutation:
  //   initial   → set enrollment to ACTIVATION_FAILED
  //   renewal   → leave enrollment status alone (active access continues)
  //   reactivation → leave as SUSPENDED
  if (sp.type === 'subscription_initial' || sp.type === 'credit_month') {
    // A student continuing from a credit month (ACTIVE) keeps the month they
    // already have; the failed payment is for the month after it.
    await admin
      .from('group_enrollments')
      .update({ status: 'ACTIVATION_FAILED', payment_status: 'ACTIVATION_FAILED' })
      .eq('id', sp.enrollment_id)
      .neq('status', 'ACTIVE');
  } else if (sp.type === 'subscription_renewal') {
    await admin
      .from('group_enrollments')
      .update({ payment_status: 'ACTIVATION_FAILED' })
      .eq('id', sp.enrollment_id)
      .in('status', ['ACTIVE', 'GRACE']);
  }
  // reactivation: enrollment stays SUSPENDED — no update needed

  // Notify student (do not ask to pay again)
  await admin.from('notifications').insert({
    user_id: sp.student_id,
    type: 'subscription_activation_delayed',
    title: 'Payment received — activation pending',
    message: 'Your payment was received. Your access is being activated. Please do not pay again.',
    link: `/student/subscriptions`,
    group_id: sp.group_id,
    metadata: { enrollment_id: sp.enrollment_id, subscription_payment_id: sp.id },
  }).then(({ error: ne }) => {
    if (ne) console.warn('[handleSubscriptionPayment] activation_delayed notification failed:', ne);
  });

  // Create admin exception. The column is subscription_payment_id: this wrote
  // `payment_id`, which does not exist, so every one of these inserts failed
  // and the exception never reached an admin.
  await admin.from('subscription_payment_exceptions').insert({
    subscription_payment_id: sp.id,
    enrollment_id: sp.enrollment_id,
    group_id: sp.group_id,
    student_id: sp.student_id,
    exception_type: exceptionType,
    status: 'open',
    error_message: errorMsg,
  }).then(({ error: xe }) => {
    if (xe) console.warn('[handleSubscriptionPayment] exception insert failed:', xe);
  });
}

export async function countActiveSubscriptions(
  admin: SupabaseClient,
  groupId: string
): Promise<number> {
  const now = new Date().toISOString();

  const { count: mainCount } = await admin
    .from('group_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('enrollment_type', 'SUBSCRIPTION')
    .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED']);

  const { count: pendingCount } = await admin
    .from('group_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('enrollment_type', 'SUBSCRIPTION')
    .eq('status', 'PENDING_PAYMENT')
    .gt('pending_payment_expires_at', now);

  return (mainCount ?? 0) + (pendingCount ?? 0);
}
