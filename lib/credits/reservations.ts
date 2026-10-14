// Nightly housekeeping for credit reservations: every reserved spend must end
// committed (its payment happened) or released (it never will). The webhooks
// do this in the normal course; this catches what they could not see.
//
// The rule that matters: a reservation whose Stripe coupon may already have
// discounted a PAID invoice is never released — the discount was used, so the
// credits were spent. Release only once Stripe confirms the payment cannot
// happen any more.
//
//   B/C  payment PAID or ACTIVATION_FAILED (money taken) .... commit
//   B    payment PENDING > 30 min ........................... cancel the
//        PaymentIntent, expire the payment and enrolment, release
//   C    payment PENDING > 25 h and the Stripe subscription is
//        incomplete_expired / canceled (Stripe gives up after 23 h) ... release
//   B/C  payment expired or REFUNDED ......................... release
//   A    3 days past the renewal it was meant for and the coupon is no longer
//        on the subscription (used by a voided invoice, or removed) .... release

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/payments/stripeClient';
import { commitCredits, releaseCredits } from '@/lib/credits/wallet';
import type { CreditSpendContext } from '@/lib/credits/types';

const B_TIMEOUT_MS = 30 * 60 * 1000;
const C_TIMEOUT_MS = 25 * 60 * 60 * 1000;
const A_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

interface SpendRow {
  id: string;
  created_at: string;
  stripe_coupon_id: string | null;
  context: CreditSpendContext & Record<string, unknown>;
}

async function subscriptionHasCoupon(stripe: Stripe, subscriptionId: string, couponId: string): Promise<{
  status: string;
  hasCoupon: boolean;
}> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['discounts'] });
  const hasCoupon = (sub.discounts ?? []).some((d) => {
    if (!d || typeof d === 'string') return false;
    const coupon = (d as Stripe.Discount).source?.coupon;
    const id = typeof coupon === 'string' ? coupon : coupon?.id;
    return id === couponId;
  });
  return { status: sub.status, hasCoupon };
}

export async function tidyReservations(admin: SupabaseClient): Promise<{
  committed: number;
  released: number;
  cancelled_intents: number;
}> {
  const out = { committed: 0, released: 0, cancelled_intents: 0 };
  const now = Date.now();

  const { data: spends, error } = await admin
    .from('credit_ledger')
    .select('id, created_at, stripe_coupon_id, context')
    .eq('kind', 'spend')
    .eq('state', 'reserved')
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);

  let stripe: Stripe | null = null;
  const getStripe = () => (stripe ??= getStripeClient());

  for (const spend of (spends ?? []) as SpendRow[]) {
    try {
      const scenario = spend.context?.scenario;
      const age = now - Date.parse(spend.created_at);

      if (scenario === 'A') {
        const periodEnd = spend.context.period_end ? Date.parse(spend.context.period_end) : NaN;
        const subId = spend.context.stripe_subscription_id;
        if (!subId || !spend.stripe_coupon_id || !Number.isFinite(periodEnd) || now < periodEnd + A_GRACE_MS) continue;
        const { status, hasCoupon } = await subscriptionHasCoupon(getStripe(), subId, spend.stripe_coupon_id);
        if (status === 'canceled' || !hasCoupon) {
          await releaseCredits(admin, spend.id);
          out.released += 1;
        }
        continue;
      }

      const { data: sp } = await admin
        .from('subscription_payments')
        .select('id, status, enrollment_id, stripe_payment_intent_id')
        .eq('credit_spend_id', spend.id)
        .maybeSingle();

      if (!sp) {
        // Reserved but the checkout never wrote its payment row (it failed in
        // between). Nothing can pay it after an hour.
        if (age > 60 * 60 * 1000 && scenario !== 'C') {
          await releaseCredits(admin, spend.id);
          out.released += 1;
        }
        continue;
      }

      if (sp.status === 'PAID' || sp.status === 'ACTIVATION_FAILED') {
        await commitCredits(admin, spend.id, sp.id);
        out.committed += 1;
        continue;
      }

      if (sp.status === 'expired' || sp.status === 'REFUNDED') {
        if (scenario === 'C' && spend.context.stripe_subscription_id && spend.stripe_coupon_id) {
          const { status } = await subscriptionHasCoupon(getStripe(), spend.context.stripe_subscription_id, spend.stripe_coupon_id);
          if (status !== 'incomplete_expired' && status !== 'canceled') continue;
        }
        await releaseCredits(admin, spend.id);
        out.released += 1;
        continue;
      }

      if (sp.status !== 'PENDING') continue;

      if (scenario === 'B' && age > B_TIMEOUT_MS) {
        if (sp.stripe_payment_intent_id) {
          const pi = await getStripe().paymentIntents.retrieve(sp.stripe_payment_intent_id);
          if (pi.status === 'succeeded' || pi.status === 'processing') continue; // webhook will settle it
          if (pi.status !== 'canceled') {
            await getStripe().paymentIntents.cancel(pi.id);
            out.cancelled_intents += 1;
          }
        }
        await admin.from('subscription_payments').update({ status: 'expired' }).eq('id', sp.id).eq('status', 'PENDING');
        await admin
          .from('group_enrollments')
          .update({ status: 'CANCELLED', removal_reason: 'credit_month_checkout_expired', updated_at: new Date().toISOString() })
          .eq('id', sp.enrollment_id)
          .eq('status', 'PENDING_PAYMENT');
        await releaseCredits(admin, spend.id);
        out.released += 1;
        continue;
      }

      if (scenario === 'C' && age > C_TIMEOUT_MS && spend.context.stripe_subscription_id) {
        const sub = await getStripe().subscriptions.retrieve(spend.context.stripe_subscription_id);
        if (sub.status === 'incomplete_expired' || sub.status === 'canceled') {
          await admin.from('subscription_payments').update({ status: 'expired' }).eq('id', sp.id).eq('status', 'PENDING');
          await releaseCredits(admin, spend.id);
          out.released += 1;
        }
      }
    } catch (err) {
      console.error(`[credits/reservations] spend ${spend.id}:`, err);
    }
  }

  return out;
}
