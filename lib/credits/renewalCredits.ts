// Scenario A: "pay my next payment with credits" on an existing Stripe
// subscription. Credits pay the WHOLE renewal or nothing — there is no
// part-credit renewal (owner's decision, Oct 2026). A single-use 'once' coupon
// for the full invoice is attached to the subscription, so its NEXT renewal is
// a TT$0 invoice; the ledger reservation waits until that invoice is paid
// (invoice.paid commits it) or can no longer be (released).
//
// Guards, each for a way the credits could be lost or double-counted:
//   * only Stripe-billed, ACTIVE/GRACE, unpaused subscriptions — a paused one
//     voids its invoices, which would use the coupon with nothing paid;
//   * not within 2 hours of the renewal, nor with a draft invoice already
//     open — a coupon attached after the invoice is drafted lands on the
//     invoice AFTER, and the date shown would be wrong;
//   * one open reservation per subscription (a unique index, not just this
//     check);
//   * the price is read from Stripe's own preview of the next invoice —
//     plan_price_ttd can be changed by the seat route without touching Stripe.

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/payments/stripeClient';
import { baseFromGrossForProvider } from '@/lib/payments/grossUp';
import { getCreditSettings } from '@/lib/credits/settings';
import { creditAccountGuard } from '@/lib/credits/guard';
import { quoteCredits } from '@/lib/credits/quote';
import { attachCouponToSpend, CreditError, getWallet, releaseCredits, reserveCredits, safely } from '@/lib/credits/wallet';
import { createCreditCoupon } from '@/lib/credits/stripeCoupon';

const RENEWAL_LOCK_MS = 2 * 60 * 60 * 1000;

type Outcome = { ok: true; body: Record<string, unknown> } | { ok: false; status: number; body: Record<string, unknown> };

interface EnrollmentRow {
  id: string;
  student_id: string;
  payer_id: string | null;
  group_id: string;
  status: string;
  billing_provider: string | null;
  stripe_subscription_id: string | null;
  paused_at: string | null;
}

async function loadEnrollment(admin: SupabaseClient, enrollmentId: string): Promise<EnrollmentRow | null> {
  const { data } = await admin
    .from('group_enrollments')
    .select('id, student_id, payer_id, group_id, status, billing_provider, stripe_subscription_id, paused_at')
    .eq('id', enrollmentId)
    .maybeSingle();
  return (data as EnrollmentRow | null) ?? null;
}

const periodEndOf = (sub: Stripe.Subscription): number | null => {
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  const end = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof end === 'number' ? end * 1000 : null;
};

const couponIdOf = (d: string | Stripe.Discount | null | undefined): string | null => {
  if (!d || typeof d === 'string') return null;
  const c = d.source?.coupon;
  return typeof c === 'string' ? c : c?.id ?? null;
};

async function openReservation(admin: SupabaseClient, subscriptionId: string) {
  const { data } = await admin
    .from('credit_ledger')
    .select('id, amount_ttd, stripe_coupon_id, context')
    .eq('kind', 'spend')
    .eq('state', 'reserved')
    .eq('context->>scenario', 'A')
    .eq('context->>stripe_subscription_id', subscriptionId)
    .maybeSingle();
  return data as { id: string; amount_ttd: number; stripe_coupon_id: string | null; context: Record<string, unknown> } | null;
}

async function checkSubscription(
  stripe: Stripe,
  subscriptionId: string
): Promise<{ ok: true; sub: Stripe.Subscription; periodEnd: number } | { ok: false; status: number; body: Record<string, unknown> }> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['discounts'] });
  if (sub.status !== 'active' && sub.status !== 'past_due') {
    return { ok: false, status: 409, body: { error: 'This subscription is not active.', reason: 'not_active' } };
  }
  if (sub.pause_collection) {
    return { ok: false, status: 409, body: { error: 'Credits cannot be applied while a subscription is paused.', reason: 'paused' } };
  }
  if (sub.cancel_at_period_end) {
    return { ok: false, status: 409, body: { error: 'This subscription ends at the close of this period.', reason: 'ending' } };
  }
  const periodEnd = periodEndOf(sub);
  if (!periodEnd) return { ok: false, status: 409, body: { error: 'The next renewal date is not known.', reason: 'no_period' } };
  if (periodEnd - Date.now() < RENEWAL_LOCK_MS) {
    return {
      ok: false,
      status: 409,
      body: { error: 'Your renewal is being prepared. Try again after it has gone through.', reason: 'renewal_imminent' },
    };
  }
  const drafts = await stripe.invoices.list({ subscription: subscriptionId, status: 'draft', limit: 1 });
  if (drafts.data.length > 0) {
    return {
      ok: false,
      status: 409,
      body: { error: 'Your renewal is being prepared. Try again after it has gone through.', reason: 'draft_invoice' },
    };
  }
  return { ok: true, sub, periodEnd };
}

/** Attach credits to the next renewal. */
export async function applyCreditsToRenewal(params: {
  admin: SupabaseClient;
  userId: string;
  enrollmentId: string;
  requestedTtd?: number | null;
}): Promise<Outcome> {
  const { admin, userId, enrollmentId } = params;

  const settings = await getCreditSettings(admin);
  if (!settings) return { ok: false, status: 409, body: { error: 'Credits are not available yet.', reason: 'credits_unavailable' } };

  const enrollment = await loadEnrollment(admin, enrollmentId);
  if (!enrollment) return { ok: false, status: 404, body: { error: 'Subscription not found' } };
  const owner = enrollment.payer_id ?? enrollment.student_id;
  if (owner !== userId) {
    return { ok: false, status: 403, body: { error: 'Only the person who pays for this class can apply credits to it.' } };
  }
  const guard = await creditAccountGuard(admin, userId);
  if (!guard.ok) return { ok: false, status: guard.status, body: guard.body };

  if (enrollment.billing_provider !== 'stripe' || !enrollment.stripe_subscription_id) {
    return {
      ok: false,
      status: 422,
      body: {
        error:
          enrollment.billing_provider === 'lunipay'
            ? 'Credits cannot be applied to this subscription: it is billed through our previous payment provider.'
            : 'Credits can only be applied to a monthly card subscription.',
        reason: enrollment.billing_provider === 'lunipay' ? 'lunipay' : 'not_stripe',
      },
    };
  }
  if (!['ACTIVE', 'GRACE'].includes(enrollment.status) || enrollment.paused_at) {
    return { ok: false, status: 409, body: { error: 'This subscription is not active.', reason: 'not_active' } };
  }
  const subscriptionId = enrollment.stripe_subscription_id;
  if (await openReservation(admin, subscriptionId)) {
    return {
      ok: false,
      status: 409,
      body: { error: 'Credits are already set to apply to your next payment.', reason: 'already_applied' },
    };
  }

  const stripe = getStripeClient();
  const check = await checkSubscription(stripe, subscriptionId);
  if (!check.ok) return check;
  const { sub, periodEnd } = check;

  // The next invoice as Stripe will build it (promotion included).
  const preview = await stripe.invoices.createPreview({ subscription: subscriptionId });
  const preCreditCents = preview.total;
  if (!Number.isFinite(preCreditCents) || preCreditCents <= 0) {
    return { ok: false, status: 409, body: { error: 'Your next payment has nothing to apply credits to.', reason: 'nothing_due' } };
  }
  const meta = (sub.metadata ?? {}) as Record<string, string>;
  const baseTtd =
    Number(meta.recurring_total_cents) === preCreditCents && Number.isFinite(Number(meta.base_amount_ttd))
      ? Number(meta.base_amount_ttd)
      : baseFromGrossForProvider(preCreditCents / 100, 'stripe');

  const wallet = await getWallet(admin, userId);
  const quote = quoteCredits({
    scenario: 'A',
    baseTtd,
    balanceTtd: wallet?.available ?? 0,
    requestedTtd: params.requestedTtd,
    // Required by the quote, but a renewal never part-pays: the refusal below
    // demands full coverage, so the minimum-card-charge arithmetic can never
    // be what decides this. A renewal with credits is a TT$0 invoice on a card
    // that is already saved, and partial renewals are NOT part of restoring
    // the subsidy — that is scenario B only.
    minCashChargeTtd: settings.min_cash_charge_ttd,
  });
  if (!quote.fullCoverage) {
    return {
      ok: false,
      status: 422,
      body: {
        error:
          quote.refusedReason === 'no_balance'
            ? 'You have no credits available.'
            : `Credits can only pay a whole payment. You need ${quote.shortfallTtd.toFixed(2)} TTD more to cover this one.`,
        reason: quote.refusedReason ?? 'not_enough',
        shortfall_ttd: quote.shortfallTtd,
      },
    };
  }
  // Credits pay the whole renewal: the coupon takes the invoice to TT$0.
  const amountOffCents = preCreditCents;

  const periodEndIso = new Date(periodEnd).toISOString();
  let spendId: string;
  try {
    spendId = await reserveCredits(admin, {
      userId,
      amountTtd: quote.creditsApplied,
      // One key per attempt: after a removal the next attempt is a new
      // reservation, never a revival of the released one.
      key: `renewal:${subscriptionId}:${randomUUID()}`,
      context: {
        scenario: 'A',
        base_ttd: baseTtd,
        enrollment_id: enrollment.id,
        group_id: enrollment.group_id,
        stripe_subscription_id: subscriptionId,
        period_end: periodEndIso,
      },
    });
  } catch (err) {
    if (err instanceof CreditError && err.code === 'insufficient_credits') {
      return { ok: false, status: 409, body: { error: 'Your credit balance changed. Please try again.', reason: 'insufficient_credits' } };
    }
    // The unique index: a parallel request reserved first.
    const msg = err instanceof Error ? err.message : String(err);
    if (/uq_credit_ledger_open_renewal_spend|duplicate key/i.test(msg)) {
      return { ok: false, status: 409, body: { error: 'Credits are already set to apply to your next payment.', reason: 'already_applied' } };
    }
    throw err;
  }

  try {
    const coupon = await createCreditCoupon(stripe, {
      amountOffCents,
      spendId,
      idempotencyKey: `credit-coupon-${spendId}`,
    });
    await attachCouponToSpend(admin, spendId, coupon.id);
    const existing = (sub.discounts ?? [])
      .map((d) => (typeof d === 'string' ? d : d?.id))
      .filter(Boolean)
      .map((id) => ({ discount: id as string }));
    await stripe.subscriptions.update(subscriptionId, { discounts: [...existing, { coupon: coupon.id }] });
  } catch (err) {
    console.error('[credits/renewal] attaching the coupon failed:', err);
    await safely('release after coupon failure', () => releaseCredits(admin, spendId));
    return { ok: false, status: 502, body: { error: 'Could not apply your credits. Please try again.' } };
  }

  return {
    ok: true,
    body: {
      applied: true,
      credits_applied: quote.creditsApplied,
      card_charge: 0,
      full_coverage: true,
      applies_on: periodEndIso,
    },
  };
}

/**
 * Take credits back off the next renewal. Used by the "remove" button and by
 * a pause, which voids invoices and would otherwise use the coupon on an
 * invoice nobody pays. `force` skips the renewal-timing guard (a pause must
 * always remove them).
 */
export async function removeCreditsFromRenewal(params: {
  admin: SupabaseClient;
  enrollmentId: string;
  userId?: string | null;
  force?: boolean;
}): Promise<Outcome> {
  const { admin, enrollmentId } = params;
  const enrollment = await loadEnrollment(admin, enrollmentId);
  if (!enrollment?.stripe_subscription_id) return { ok: true, body: { removed: false } };
  if (params.userId && (enrollment.payer_id ?? enrollment.student_id) !== params.userId) {
    return { ok: false, status: 403, body: { error: 'Only the person who pays for this class can change this.' } };
  }

  let spend: Awaited<ReturnType<typeof openReservation>> = null;
  try {
    spend = await openReservation(admin, enrollment.stripe_subscription_id);
  } catch {
    return { ok: true, body: { removed: false } };
  }
  if (!spend) return { ok: true, body: { removed: false } };

  const stripe = getStripeClient();
  const sub = await stripe.subscriptions.retrieve(enrollment.stripe_subscription_id, { expand: ['discounts'] });
  if (!params.force) {
    const periodEnd = periodEndOf(sub);
    if (periodEnd && periodEnd - Date.now() < RENEWAL_LOCK_MS) {
      return {
        ok: false,
        status: 409,
        body: { error: 'Your renewal is being prepared; the credits will be used on it.', reason: 'renewal_imminent' },
      };
    }
  }

  const discounts = (sub.discounts ?? []).filter((d) => d && typeof d !== 'string') as Stripe.Discount[];
  const ours = discounts.find((d) => couponIdOf(d) === spend!.stripe_coupon_id);
  if (ours) {
    const keep = discounts.filter((d) => d.id !== ours.id).map((d) => ({ discount: d.id }));
    await stripe.subscriptions.update(enrollment.stripe_subscription_id, { discounts: keep.length ? keep : '' as any });
  }
  // The coupon is off the subscription (or was already used on an invoice
  // that was not paid): nothing can redeem it now.
  await releaseCredits(admin, spend.id);
  return { ok: true, body: { removed: true } };
}
