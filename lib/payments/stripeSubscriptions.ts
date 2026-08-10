// =====================================================
// STRIPE SUBSCRIPTION HELPERS
// =====================================================
// Customer-per-student and recurring-Price-per-group, the two
// persistent Stripe objects native subscriptions require.
//
// Direct-pay (1:1) creates guest PaymentIntents with no Customer, so
// none of this existed before group subscriptions moved to Stripe.
// =====================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getStripeClient, ttdToCents } from './stripeClient';
import { calculateGrossAmountForProvider } from './grossUp';

type AdminClient = SupabaseClient<any, 'public', 'public', any, any>;

/**
 * Returns the student's Stripe Customer id, creating it on first use.
 *
 * The id is cached on profiles so a student maps to exactly one Customer
 * — otherwise every renewal would spawn a new one and saved cards would
 * scatter across them.
 */
export async function ensureStripeCustomer(
  admin: AdminClient,
  userId: string
): Promise<string> {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, email, full_name, display_name, stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile) throw new Error('Profile not found');

  const stripe = getStripeClient();

  // A cached Customer belongs to ONE Stripe mode. Switching the API key from
  // test to live (or between accounts) leaves an id here that the current key
  // cannot see, and Stripe rejects it with "No such customer" — so the
  // student's first subscription after the switch fails for no visible reason.
  //
  // Verify the cached id resolves under the CURRENT key; if it doesn't, mint a
  // fresh one rather than failing. Deleted customers are treated the same way.
  let staleCustomerId: string | null = null;
  if (profile.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(profile.stripe_customer_id);
      if (!(existing as Stripe.DeletedCustomer).deleted) {
        return profile.stripe_customer_id;
      }
      staleCustomerId = profile.stripe_customer_id;
      console.warn(
        `[stripe] Cached customer ${profile.stripe_customer_id} is deleted — creating a new one`
      );
    } catch {
      staleCustomerId = profile.stripe_customer_id;
      console.warn(
        `[stripe] Cached customer ${profile.stripe_customer_id} not found under the current key (mode/account switch) — creating a new one`
      );
    }
  }
  const customer = await stripe.customers.create(
    {
      email: profile.email ?? undefined,
      name: profile.display_name || profile.full_name || undefined,
      metadata: { student_id: userId },
    },
    // Guards against two concurrent subscribe requests creating two
    // Customers for the same student.
    // Distinct key when replacing a stale customer: reusing the original
    // would make Stripe replay the very customer we just rejected.
    {
      idempotencyKey: staleCustomerId
        ? `customer-${userId}-retry-${staleCustomerId}`
        : `customer-${userId}`,
    }
  );

  const { error: updErr } = await admin
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId);

  if (updErr) {
    // The Customer exists in Stripe but we failed to record it. Surface
    // it rather than silently creating another one next time.
    throw new Error(`Failed to store stripe_customer_id: ${updErr.message}`);
  }

  return customer.id;
}

/**
 * Returns a monthly recurring Price for the group, creating one if the
 * group has none or if the tutor has since changed the price.
 *
 * Stripe Prices are IMMUTABLE — you cannot edit the amount. A price
 * change therefore mints a NEW Price and repoints the group. Existing
 * subscribers stay on the Price they signed up at until explicitly
 * migrated, which is the safe default: nobody's bill changes without a
 * deliberate action.
 */
export async function ensureGroupPrice(
  admin: AdminClient,
  group: {
    id: string;
    name: string;
    price_monthly: number | string | null;
    stripe_price_id?: string | null;
    stripe_price_amount_ttd?: number | string | null;
  }
): Promise<string> {
  const amount = Number(group.price_monthly ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Group has no monthly price');
  }

  // The student pays the processing fee ON TOP of the tutor's price, so the
  // recurring Price is the grossed-up total — the same model as 1:1.
  //
  // This previously used price_monthly directly, so Stripe charged the bare
  // TT$120 while checkout displayed a TT$5.68 processing fee that was never
  // collected: the line was fiction and the platform absorbed the fee every
  // month, for every subscriber.
  //
  // Note the tutor's payout is unaffected either way — it's computed from
  // subscription_payments.amount_ttd, which stays the BASE price.
  const { grossAmount } = calculateGrossAmountForProvider(amount, 'stripe');

  const cached = group.stripe_price_id;
  // Compared against the BASE price, not the gross, so the check still
  // detects a tutor editing their price even if the fee schedule changes.
  const cachedAmount = Number(group.stripe_price_amount_ttd ?? NaN);
  if (cached && Number.isFinite(cachedAmount) && cachedAmount === amount) {
    return cached;
  }

  const stripe = getStripeClient();
  const price = await stripe.prices.create({
    currency: 'ttd',
    unit_amount: ttdToCents(grossAmount),
    recurring: { interval: 'month' },
    product_data: { name: `${group.name} — Monthly` },
    metadata: {
      group_id: group.id,
      base_amount_ttd: String(amount),
      gross_amount_ttd: String(grossAmount),
    },
  });

  await admin
    .from('groups')
    .update({ stripe_price_id: price.id, stripe_price_amount_ttd: amount })
    .eq('id', group.id);

  return price.id;
}

/**
 * Converts a class end date into the `cancel_at` timestamp Stripe uses
 * to stop billing automatically.
 *
 * Rounded UP to the billing-period boundary that follows the class end date,
 * never the end date itself. Tutors are paid by the month and never a part
 * month, and a cancel_at that lands mid-period makes Stripe bill a fraction:
 *
 *   "cancel_at … If set to a date before the current period ends, this will
 *    cause a proration if prorations have been enabled using
 *    proration_behavior. If set during a future period, this will always
 *    cause a proration for that period."   — Stripe API reference
 *
 * That is exactly what happened in production: a TT$250 class ending on 31
 * August, subscribed to on 6 August, billed 25.23/31 of the month — TT$213.49
 * against a recorded sale of TT$250 and a tutor payout of TT$232.50, so the
 * platform would have paid out more than it collected. Note the second
 * sentence: for a FUTURE period the proration is unconditional, so
 * proration_behavior alone would not have saved the final month of a long
 * class. The boundary has to be aligned.
 *
 * Landing on the boundary means the student keeps access for the remainder of
 * the month they have paid for, which is the same deal as cancelling normally.
 *
 * Returns undefined for a class with no end date, which Stripe treats as
 * "recurring until cancelled". Also returns undefined for a date already
 * in the past — Stripe rejects a cancel_at that isn't in the future, and
 * a backfilled class could legitimately have one.
 */
export function endDateToCancelAt(
  endDate: string | null | undefined,
  /** Billing anchor — the subscription's start. Defaults to now. */
  anchor: Date = new Date()
): number | undefined {
  if (!endDate) return undefined;
  // End of the given day, Trinidad time (UTC-4), so a class "ending on
  // the 30th" bills through the 30th rather than stopping at midnight UTC.
  const endTs = Date.parse(`${String(endDate).slice(0, 10)}T23:59:59-04:00`);
  if (!Number.isFinite(endTs)) return undefined;
  if (endTs <= anchor.getTime()) return undefined;

  // Walk monthly anniversaries of the anchor until one falls on or after the
  // class end, so the subscription always stops on a whole-month boundary.
  // Capped so a far-future or malformed end date cannot spin.
  const boundary = new Date(anchor.getTime());
  for (let i = 0; i < 120 && boundary.getTime() < endTs; i += 1) {
    boundary.setMonth(boundary.getMonth() + 1);
  }
  if (boundary.getTime() < endTs) return undefined; // beyond 10 years — let it run

  return Math.floor(boundary.getTime() / 1000);
}

export type { Stripe };
