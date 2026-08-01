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
  if (profile.stripe_customer_id) return profile.stripe_customer_id;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create(
    {
      email: profile.email ?? undefined,
      name: profile.display_name || profile.full_name || undefined,
      metadata: { student_id: userId },
    },
    // Guards against two concurrent subscribe requests creating two
    // Customers for the same student.
    { idempotencyKey: `customer-${userId}` }
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
 * Returns undefined for a class with no end date, which Stripe treats as
 * "recurring until cancelled". Also returns undefined for a date already
 * in the past — Stripe rejects a cancel_at that isn't in the future, and
 * a backfilled class could legitimately have one.
 */
export function endDateToCancelAt(endDate: string | null | undefined): number | undefined {
  if (!endDate) return undefined;
  // End of the given day, Trinidad time (UTC-4), so a class "ending on
  // the 30th" bills through the 30th rather than stopping at midnight UTC.
  const ts = Date.parse(`${String(endDate).slice(0, 10)}T23:59:59-04:00`);
  if (!Number.isFinite(ts)) return undefined;
  const seconds = Math.floor(ts / 1000);
  if (seconds <= Math.floor(Date.now() / 1000)) return undefined;
  return seconds;
}

export type { Stripe };
