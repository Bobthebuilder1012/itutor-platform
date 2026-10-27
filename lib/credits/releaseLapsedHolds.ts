import type { SupabaseClient } from '@supabase/supabase-js';
import { expireSubscriptionPayment } from '@/lib/services/subscriptionPayments';

/**
 * Hand back credits reserved for a checkout that was never finished.
 *
 * WHY THIS IS NOT LEFT TO THE CRON. Reserving credits takes them out of the
 * spendable balance the moment a checkout starts, which is correct — two
 * checkouts must not spend the same credits. But the only sweep that released
 * an abandoned one ran once a day, so a student who opened a credit checkout
 * and closed the tab saw their balance sit at zero until the next run. On
 * production on 2026-10-26, the first time the subsidy was tried, that was
 * TT$100 of a TT$100 balance, and from the student's side it looked exactly
 * like being charged for nothing.
 *
 * So the balance repairs itself whenever it is read. This is cheap: the
 * filtered select returns nothing at all in the normal case, which is every
 * read by every student who has no lapsed checkout.
 *
 * Only rows whose checkout window has already passed are touched, and
 * expireSubscriptionPayment itself only acts on ones still PENDING and skips
 * credits travelling on a Stripe coupon, whose invoice may yet be paid.
 *
 * Never throws: a balance that cannot be repaired must still be shown.
 */
export async function releaseLapsedCreditHolds(
  admin: SupabaseClient,
  userId: string
): Promise<number> {
  try {
    const { data: lapsed } = await admin
      .from('subscription_payments')
      .select('id')
      // payer_id is NULL when the student pays for themself — the same
      // convention group_enrollments uses. Matching on payer_id alone would
      // therefore miss every self-paying student, which is nearly all of
      // them, and this sweep would have done nothing at all.
      .or(`payer_id.eq.${userId},and(payer_id.is.null,student_id.eq.${userId})`)
      .eq('status', 'PENDING')
      .not('credit_spend_id', 'is', null)
      .lt('checkout_expires_at', new Date().toISOString());

    let released = 0;
    for (const row of lapsed ?? []) {
      try {
        await expireSubscriptionPayment(admin, (row as { id: string }).id);
        released++;
      } catch (err) {
        console.warn('[credits] could not release lapsed hold', (row as { id: string }).id, err);
      }
    }
    return released;
  } catch (err) {
    console.warn('[credits] lapsed-hold sweep failed', err);
    return 0;
  }
}
