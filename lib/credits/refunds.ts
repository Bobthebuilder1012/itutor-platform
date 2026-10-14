// What a refunded subscription payment does to credits.
//
//   1. Credits spent on it go back to the wallet (into the lots they came
//      from, so expiry still holds).
//   2. If it was a friend's qualifying payment, the referral is rejected and
//      the reward it counted toward is clawed back. Credits already spent are
//      never driven negative: the gap is recorded for an admin.
//
// Called from charge.refunded (Stripe), the admin reverse route, and the
// LuniPay removal-refund path. Every step is idempotent, so the same refund
// reaching two of them is harmless.
//
// A PARTIAL refund changes nothing automatically — which part of the payment
// was refunded, the cash or the credits, is a judgement — and is flagged for
// an admin instead. Never throws.

import type { SupabaseClient } from '@supabase/supabase-js';
import { creditsCol, withOptionalCredits } from '@/lib/credits/cash';
import { isMissingSchema } from '@/lib/supabase/schemaErrors';

export async function onSubscriptionPaymentRefunded(
  admin: SupabaseClient,
  subscriptionPaymentId: string,
  opts: { full: boolean; source: string }
): Promise<void> {
  try {
    const { data: sp } = await withOptionalCredits((on) =>
      admin
        .from('subscription_payments')
        .select('id, enrollment_id, group_id, student_id' + (on ? ', credit_spend_id' : '') + creditsCol(on))
        .eq('id', subscriptionPaymentId)
        .maybeSingle()
    );
    if (!sp) return;

    const { data: spends, error: spendErr } = await admin
      .from('credit_ledger')
      .select('id, state')
      .eq('kind', 'spend')
      .or(
        sp.credit_spend_id
          ? `subscription_payment_id.eq.${sp.id},id.eq.${sp.credit_spend_id}`
          : `subscription_payment_id.eq.${sp.id}`
      );
    if (spendErr) {
      if (isMissingSchema(spendErr)) return; // credits not set up here
      console.error('[credits/refunds] spend lookup failed:', spendErr.message);
    }

    const { data: referrals } = await admin
      .from('referrals')
      .select('id')
      .eq('qualifying_payment_id', sp.id)
      .eq('status', 'converted');

    const touchesCredits = (spends ?? []).length > 0 || (referrals ?? []).length > 0;
    if (!touchesCredits) return;

    if (!opts.full) {
      await admin.from('subscription_payment_exceptions').insert({
        subscription_payment_id: sp.id,
        enrollment_id: sp.enrollment_id,
        group_id: sp.group_id,
        student_id: sp.student_id,
        exception_type: 'credit_mismatch',
        status: 'open',
        error_message:
          `Partial refund (${opts.source}) on a payment that used credits or converted a referral. ` +
          'Credits were not restored or clawed back automatically; adjust by hand if needed.',
      });
      return;
    }

    for (const spend of spends ?? []) {
      const { error } = await admin.rpc('restore_credits', {
        p_spend_id: spend.id,
        p_key: `restore:${sp.id}:${spend.id}`,
      });
      if (error) console.error('[credits/refunds] restore failed:', error.message);
    }

    for (const referral of referrals ?? []) {
      const { error } = await admin.rpc('refund_referral', { p_referral_id: referral.id, p_reason: 'refunded' });
      if (error) console.error('[credits/refunds] referral clawback failed:', error.message);
    }
  } catch (err) {
    console.error('[credits/refunds] threw:', err);
  }
}
