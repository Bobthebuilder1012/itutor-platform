// Scenario B: one month of a class, paid with credits (all of it, or part with
// the rest by card). Never renews — process-subscriptions completes it when
// the month ends, and the student is invited to subscribe.
//
// Shares every eligibility rule with the subscription checkout
// (lib/payments/groupEnrollmentEligibility.ts). Differences, all deliberate:
//   * a full class is refused, not waitlisted — a waitlist promises a seat
//     when one frees up, and credits cannot be held that long;
//   * no promotions — credits are already the discount;
//   * no Stripe at all when credits cover the month.
//
// The tutor is paid on the full monthly price either way: amount_ttd is the
// price, credits_applied_ttd the part iTutor funded.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripeClient } from '@/lib/payments/stripeClient';
import { ensureStripeCustomer } from '@/lib/payments/stripeSubscriptions';
import { checkCapacity, loadCheckoutContext } from '@/lib/payments/groupEnrollmentEligibility';
import {
  createPendingSubscriptionPayment,
  expireSubscriptionPayment,
  handleSubscriptionPayment,
} from '@/lib/services/subscriptionPayments';
import { getCreditSettings } from '@/lib/credits/settings';
import { creditAccountGuard } from '@/lib/credits/guard';
import { quoteCredits } from '@/lib/credits/quote';
import { CreditError, getWallet, releaseCredits, reserveCredits, safely } from '@/lib/credits/wallet';
import { cancelIncompleteSubscription } from '@/lib/credits/stripeCoupon';
import { track } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import type { SeatType } from '@/lib/utils/seatCapacity';

const CHECKOUT_WINDOW_MS = 30 * 60 * 1000;

export type CreditMonthOutcome =
  | { ok: true; status: 200 | 201; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

async function cancelEnrollment(admin: SupabaseClient, enrollmentId: string, reason: string) {
  await admin
    .from('group_enrollments')
    .update({ status: 'CANCELLED', removal_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', enrollmentId)
    .eq('status', 'PENDING_PAYMENT');
}

export async function createCreditMonthCheckout(params: {
  admin: SupabaseClient;
  groupId: string;
  /** Who attends. */
  studentId: string;
  /** Whose credits (and card, for any remainder). Equal to studentId for a student. */
  payerId: string;
  payerEmail: string | null | undefined;
  seatType?: SeatType | null;
  /** Credits to apply; omitted = as many as the month allows. */
  useCreditsTtd?: number | null;
}): Promise<CreditMonthOutcome> {
  const { admin, groupId, studentId, payerId, payerEmail, seatType } = params;

  const settings = await getCreditSettings(admin);
  if (!settings) {
    return { ok: false, status: 409, body: { error: 'Credits are not available yet.', reason: 'credits_unavailable' } };
  }
  const guard = await creditAccountGuard(admin, payerId);
  if (!guard.ok) return { ok: false, status: guard.status, body: guard.body };

  const loaded = await loadCheckoutContext({ admin, groupId, studentId, seatType, requireStripe: false });
  if (!loaded.ok) return loaded;
  const { ctx } = loaded;

  if (ctx.continuingFromSecured || ctx.continuingFromCreditMonth || ctx.activeEnrollment) {
    return {
      ok: false,
      status: 409,
      body: { error: 'You already have a place in this class.', reason: 'already_enrolled' },
    };
  }

  // An unfinished checkout for this class. Still inside its 30 minutes: it is
  // theirs to finish. Abandoned: retire it, so it stops blocking the seat (a
  // Stripe-billed one is otherwise never expired), then start fresh.
  if (ctx.pendingEnrollment) {
    const expiresAt = ctx.pendingEnrollment.pending_payment_expires_at;
    if (expiresAt && Date.parse(expiresAt) > Date.now()) {
      return {
        ok: false,
        status: 409,
        body: {
          error: 'You have a checkout in progress for this class. Finish it, or try again in 30 minutes.',
          reason: 'checkout_in_progress',
        },
      };
    }
    const { data: stalePayments } = await admin
      .from('subscription_payments')
      .select('id, stripe_subscription_id, credit_spend_id')
      .eq('enrollment_id', ctx.pendingEnrollment.id)
      .eq('status', 'PENDING');
    for (const p of stalePayments ?? []) {
      if (p.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
        await cancelIncompleteSubscription(getStripeClient(), p.stripe_subscription_id);
      }
      await expireSubscriptionPayment(admin, p.id);
      if (p.credit_spend_id) await safely('release stale reservation', () => releaseCredits(admin, p.credit_spend_id));
    }
    await cancelEnrollment(admin, ctx.pendingEnrollment.id, 'checkout_abandoned');
  }

  const capacity = await checkCapacity(admin, { ...ctx, isReusingEnrollment: false }, groupId);
  if (!capacity.ok) {
    if ('full' in capacity) {
      return {
        ok: false,
        status: 409,
        body: { error: 'This class is full. Join the waitlist from the class page instead.', reason: 'class_full' },
      };
    }
    return capacity;
  }

  const base = Math.round(Number(ctx.group.price_monthly) * 100) / 100;
  const wallet = await getWallet(admin, payerId);
  const quote = quoteCredits({
    scenario: 'B',
    baseTtd: base,
    balanceTtd: wallet?.available ?? 0,
    requestedTtd: params.useCreditsTtd,
    minCashChargeTtd: settings.min_cash_charge_ttd,
  });
  if (quote.creditsApplied <= 0) {
    return {
      ok: false,
      status: 422,
      body: {
        error:
          quote.refusedReason === 'no_balance'
            ? 'You have no credits available.'
            : 'Credits cannot be used on this class: the card charge would fall below the minimum.',
        reason: quote.refusedReason ?? 'below_minimum',
      },
    };
  }
  if (!quote.fullCoverage && (!process.env.STRIPE_SECRET_KEY || !payerEmail)) {
    return {
      ok: false,
      status: !payerEmail ? 400 : 503,
      body: {
        error: !payerEmail
          ? 'Your account is missing an email address'
          : 'Card payments are not available on this environment',
      },
    };
  }

  // ── Rows ──────────────────────────────────────────────────────────────
  const now = new Date();
  const pendingExpiresAt = new Date(now.getTime() + CHECKOUT_WINDOW_MS).toISOString();
  const { data: enrollment, error: enrollErr } = await admin
    .from('group_enrollments')
    .insert({
      group_id: groupId,
      student_id: studentId,
      enrollment_type: 'SUBSCRIPTION',
      status: 'PENDING_PAYMENT',
      payment_status: 'PENDING',
      plan_price_ttd: base,
      original_price_ttd: base,
      payer_id: payerId === studentId ? null : payerId,
      seat_type: ctx.requestedSeat,
      // Never renews: the self-billing cron's reminders, grace and
      // suspension skip 'credits', and Task 7 completes it when the month ends.
      billing_provider: 'credits',
      cancel_at_period_end: false,
      pending_payment_expires_at: pendingExpiresAt,
      reminder_count: 0,
    })
    .select('id')
    .single();
  if (enrollErr || !enrollment) {
    console.error('[credit-month] enrolment insert failed:', enrollErr);
    return { ok: false, status: 500, body: { error: 'Could not start the purchase' } };
  }
  const enrollmentId = enrollment.id as string;

  const payment = await createPendingSubscriptionPayment(admin, {
    enrollmentId,
    groupId,
    studentId,
    payerId,
    type: 'credit_month',
    amountTtd: base,
    originalAmountTtd: base,
  });

  let spendId: string;
  try {
    spendId = await reserveCredits(admin, {
      userId: payerId,
      amountTtd: quote.creditsApplied,
      key: `credit-month:${payment.id}`,
      context: { scenario: 'B', base_ttd: base, enrollment_id: enrollmentId, group_id: groupId },
    });
  } catch (err) {
    await expireSubscriptionPayment(admin, payment.id);
    await cancelEnrollment(admin, enrollmentId, 'credits_unavailable');
    const insufficient = err instanceof CreditError && err.code === 'insufficient_credits';
    return {
      ok: false,
      status: insufficient ? 409 : 500,
      body: {
        error: insufficient ? 'Your credit balance changed. Please try again.' : 'Could not apply your credits.',
        reason: insufficient ? 'insufficient_credits' : 'credits_failed',
      },
    };
  }

  await admin
    .from('subscription_payments')
    .update({
      credits_applied_ttd: quote.creditsApplied,
      credit_spend_id: spendId,
      charged_processing_fee_ttd: quote.processingFee,
      payment_method: quote.fullCoverage ? 'credits' : 'card',
    })
    .eq('id', payment.id);

  await track(PRODUCT_EVENTS.ENROLMENT_STARTED, { group_id: groupId }, { userId: studentId });

  // ── Credits cover the month: done, no Stripe ─────────────────────────
  if (quote.fullCoverage) {
    const result = await handleSubscriptionPayment({ admin, subscriptionPaymentId: payment.id, source: 'credits' });
    if (!result.ok) {
      // handleSubscriptionPayment committed the credits before activating;
      // nothing was bought, so they go straight back.
      await safely('restore credits after failed activation', async () => {
        const { error } = await admin.rpc('restore_credits', {
          p_spend_id: spendId,
          p_key: `restore:${payment.id}:${spendId}`,
        });
        if (error) throw new Error(error.message);
      });
      await admin
        .from('group_enrollments')
        .update({ status: 'CANCELLED', removal_reason: 'credit_month_activation_failed' })
        .eq('id', enrollmentId)
        .in('status', ['PENDING_PAYMENT', 'ACTIVATION_FAILED']);
      return {
        ok: false,
        status: result.error === 'capacity_conflict' ? 409 : 500,
        body: {
          error:
            result.error === 'capacity_conflict'
              ? 'The last seat was just taken. Your credits have been returned.'
              : 'Could not complete the purchase. Your credits have been returned.',
        },
      };
    }
    return {
      ok: true,
      status: 201,
      body: {
        completed: true,
        enrollment_id: enrollmentId,
        payment_id: payment.id,
        amount: base,
        credits_applied: quote.creditsApplied,
        total: 0,
        period_end: result.receipt?.periodEnd ?? null,
      },
    };
  }

  // ── Part credits, part card: a one-off PaymentIntent ─────────────────
  try {
    const stripe = getStripeClient();
    const customerId = await ensureStripeCustomer(admin as any, payerId);
    const intent = await stripe.paymentIntents.create(
      {
        amount: quote.cashGrossCents,
        currency: 'ttd',
        customer: customerId,
        description: `One month — ${ctx.group.name ?? 'class'} (part paid with iTutor credits)`,
        // Saved so subscribing after this month is a one-click confirm.
        setup_future_usage: 'off_session',
        automatic_payment_methods: { enabled: true },
        metadata: {
          // The webhook routes 'credit_month' through handleSubscriptionPayment.
          kind: 'credit_month',
          enrollment_id: enrollmentId,
          group_id: groupId,
          student_id: studentId,
          payer_id: payerId === studentId ? '' : payerId,
          payment_id: payment.id,
          base_amount_ttd: String(base),
          credits_applied_ttd: String(quote.creditsApplied),
          processing_fee_ttd: String(quote.processingFee),
        },
      },
      { idempotencyKey: `credit-month-${payment.id}` }
    );

    // Written BEFORE the redirect: the checkout page and the status route
    // find this payment by its PaymentIntent id.
    await admin
      .from('subscription_payments')
      .update({ stripe_payment_intent_id: intent.id })
      .eq('id', payment.id);

    return {
      ok: true,
      status: 201,
      body: {
        completed: false,
        checkout_url: `/payments/checkout?pi=${intent.id}`,
        client_secret: intent.client_secret,
        payment_intent_id: intent.id,
        enrollment_id: enrollmentId,
        payment_id: payment.id,
        amount: base,
        credits_applied: quote.creditsApplied,
        processing_fee: quote.processingFee,
        total: quote.cashGross,
        currency: 'TTD',
      },
    };
  } catch (err) {
    console.error('[credit-month] PaymentIntent failed:', err);
    // No intent exists, so nothing can pay: hand the credits back.
    await expireSubscriptionPayment(admin, payment.id);
    await safely('release after Stripe failure', () => releaseCredits(admin, spendId));
    await cancelEnrollment(admin, enrollmentId, 'checkout_failed');
    return { ok: false, status: 502, body: { error: 'Failed to create checkout session' } };
  }
}
