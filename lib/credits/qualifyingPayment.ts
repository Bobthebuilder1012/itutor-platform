// Did this payment convert a referral?
//
// Called right after a CARD payment for a group class is confirmed and the
// `paid` event fires:
//   * handleSubscriptionPayment  (lib/services/subscriptionPayments.ts) —
//     every Stripe invoice and credit-month PaymentIntent
//   * confirmSecuredSpot         (lib/services/secureSpotService.ts)
// and by the nightly job (app/api/cron/credits-nightly) for anything missed.
// It is deliberately NOT called for cash a tutor records: the owner ruled
// that only Stripe-confirmed payments convert a referral, because a tutor can
// mark cash paid with no card to check.
//
// The friend who converts is the STUDENT on the enrolment, even when a parent
// pays. A referred parent paying for their own child also converts their own
// referral. The fraud checks look at the payer. One payment converts at most
// one referral, and only a referee's first qualifying payment counts
// (referrals.referee_id is unique; a converted referral is never revisited).
//
// A payment that does not qualify on SIZE — too little real cash, or paid
// with credits — leaves the referral open: the friend's next payment may
// qualify. A payment that fails a FRAUD check rejects the referral for good.
//
// Never throws. The webhook that calls this has already activated the
// enrolment; a failure here is logged and the nightly job retries.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripeClient } from '@/lib/payments/stripeClient';
import { getCreditSettings } from '@/lib/credits/settings';
import { cashBaseTtd, creditsCol, withOptionalCredits } from '@/lib/credits/cash';
import {
  customerCardFingerprints,
  invoicePaymentRefs,
  paymentCardFingerprint,
} from '@/lib/credits/stripeLookup';
import { firstNameAndInitial, notifyCredits, rewardMessage } from '@/lib/credits/notify';

export type QualifyingOutcome =
  | 'off'
  | 'no_referral'
  | 'not_paid'
  | 'not_card'
  | 'below_minimum'
  | 'before_enabled'
  | 'stripe_unavailable'
  | 'rejected'
  | 'converted'
  | 'error';

interface PaymentRow {
  id: string;
  status: string;
  type: string;
  student_id: string;
  payer_id: string | null;
  amount_ttd: number | string;
  credits_applied_ttd?: number | string | null;
  payment_method: string | null;
  paid_at: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
}

async function reject(admin: SupabaseClient, referralId: string, reason: string, extra: Record<string, unknown> = {}) {
  await admin
    .from('referrals')
    .update({ status: 'rejected', rejected_reason: reason, rejected_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...extra })
    .eq('id', referralId)
    .eq('status', 'signed_up');
}

export async function recordQualifyingPayment(
  admin: SupabaseClient,
  subscriptionPaymentId: string
): Promise<QualifyingOutcome> {
  try {
    const settings = await getCreditSettings(admin);
    if (!settings?.referrals_enabled) return 'off';

    const { data: spData, error: spErr } = await withOptionalCredits((on) =>
      admin
        .from('subscription_payments')
        .select(
          'id, status, type, student_id, payer_id, amount_ttd, payment_method, paid_at, stripe_payment_intent_id, stripe_charge_id, stripe_invoice_id' +
            creditsCol(on)
        )
        .eq('id', subscriptionPaymentId)
        .maybeSingle()
    );
    if (spErr || !spData) return 'error';
    const sp = spData as PaymentRow;

    const candidates = Array.from(new Set([sp.student_id, sp.payer_id].filter(Boolean))) as string[];
    const { data: referralRows } = await admin
      .from('referrals')
      .select('id, referrer_id, referee_id, status')
      .in('referee_id', candidates)
      .eq('status', 'signed_up');
    if (!referralRows || referralRows.length === 0) return 'no_referral';
    // The student's own referral first; the paying parent's otherwise.
    const referral =
      referralRows.find((r) => r.referee_id === sp.student_id) ?? referralRows[0];

    if (sp.status !== 'PAID') return 'not_paid';
    if (sp.payment_method === 'cash' || sp.payment_method === 'credits') return 'not_card';
    // Stripe-confirmed only: a legacy LuniPay payment has no card to check.
    if (!sp.stripe_payment_intent_id && !sp.stripe_charge_id && !sp.stripe_invoice_id) return 'not_card';
    if (settings.referrals_enabled_at && sp.paid_at && sp.paid_at < settings.referrals_enabled_at) {
      return 'before_enabled';
    }

    const cash = cashBaseTtd(sp);
    if (cash < settings.min_qualifying_cash_ttd || cash <= 0) return 'below_minimum';

    const referrerId = referral.referrer_id as string;
    const refereeId = referral.referee_id as string;
    const payerId = sp.payer_id ?? sp.student_id;

    if (payerId === referrerId) {
      await reject(admin, referral.id, 'payer_is_referrer', { qualifying_payment_id: sp.id, payer_id: payerId });
      return 'rejected';
    }

    // A parent may not refer their own child (in either direction).
    const { data: directLinks } = await admin
      .from('parent_child_links')
      .select('parent_id, child_id')
      .or(
        `and(parent_id.eq.${referrerId},child_id.eq.${refereeId}),and(parent_id.eq.${refereeId},child_id.eq.${referrerId})`
      );
    if (directLinks && directLinks.length > 0) {
      await reject(admin, referral.id, 'parent_child', { qualifying_payment_id: sp.id, payer_id: payerId });
      return 'rejected';
    }

    // Siblings: two children linked to the same parent. A parent often pays
    // for both on one card, so the shared-customer and card checks are skipped.
    const { data: links } = await admin
      .from('parent_child_links')
      .select('parent_id, child_id')
      .in('child_id', [referrerId, refereeId]);
    const parentsOf = (child: string) => new Set((links ?? []).filter((l) => l.child_id === child).map((l) => l.parent_id));
    const referrerParents = parentsOf(referrerId);
    const isSibling = Array.from(parentsOf(refereeId)).some((p) => referrerParents.has(p));

    let fingerprint: string | null = null;
    if (!isSibling) {
      const { data: people } = await admin
        .from('profiles')
        .select('id, stripe_customer_id')
        .in('id', [referrerId, payerId]);
      const customerOf = (id: string) => (people ?? []).find((p) => p.id === id)?.stripe_customer_id ?? null;
      const referrerCustomer = customerOf(referrerId);
      const payerCustomer = customerOf(payerId);

      if (referrerCustomer && payerCustomer && referrerCustomer === payerCustomer) {
        await reject(admin, referral.id, 'shared_customer', { qualifying_payment_id: sp.id, payer_id: payerId });
        return 'rejected';
      }

      try {
        const stripe = getStripeClient();
        let refs = { chargeId: sp.stripe_charge_id, paymentIntentId: sp.stripe_payment_intent_id };
        if (!refs.chargeId && !refs.paymentIntentId && sp.stripe_invoice_id) {
          refs = await invoicePaymentRefs(stripe, sp.stripe_invoice_id);
        }
        const card = await paymentCardFingerprint(stripe, refs);
        fingerprint = card.fingerprint;

        if (referrerCustomer && card.customerId && card.customerId === referrerCustomer) {
          await reject(admin, referral.id, 'shared_customer', { qualifying_payment_id: sp.id, payer_id: payerId, payer_fingerprint: fingerprint });
          return 'rejected';
        }
        if (fingerprint && referrerCustomer) {
          const referrerCards = await customerCardFingerprints(stripe, referrerCustomer);
          if (referrerCards.includes(fingerprint)) {
            await reject(admin, referral.id, 'shared_card', { qualifying_payment_id: sp.id, payer_id: payerId, payer_fingerprint: fingerprint });
            return 'rejected';
          }
        }
      } catch (err) {
        // Cannot check the card: leave the referral open for the nightly job
        // rather than convert it unchecked.
        console.warn('[credits/qualifyingPayment] Stripe lookup failed:', err);
        return 'stripe_unavailable';
      }
    }

    const { data: converted, error: convErr } = await admin
      .from('referrals')
      .update({
        status: 'converted',
        qualifying_payment_id: sp.id,
        cash_paid_ttd: cash,
        payer_id: payerId,
        payer_fingerprint: fingerprint,
        is_sibling_referral: isSibling,
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', referral.id)
      .eq('status', 'signed_up')
      .select('id')
      .maybeSingle();
    if (convErr) {
      console.error('[credits/qualifyingPayment] convert failed:', convErr.message);
      return 'error';
    }
    if (!converted) return 'no_referral'; // converted concurrently

    const { data: rewards, error: evalErr } = await admin.rpc('evaluate_referral_rewards', { p_referrer: referrerId });
    if (evalErr) console.error('[credits/qualifyingPayment] evaluate failed:', evalErr.message);

    const { data: friend } = await admin.from('profiles').select('full_name').eq('id', refereeId).maybeSingle();
    const friendName = firstNameAndInitial(friend?.full_name);

    await notifyCredits(admin, {
      userId: referrerId,
      type: 'referral_converted',
      title: 'Your friend joined a class',
      message: `${friendName} paid for a class through your link. It counts toward your next reward.`,
      metadata: { referral_id: referral.id },
    });
    if (Number(rewards ?? 0) > 0) {
      await notifyCredits(admin, {
        userId: referrerId,
        type: 'referral_reward',
        title: 'You earned iTutor credits',
        message: rewardMessage(settings.credit_value_ttd, Number(rewards), settings.hold_days),
        metadata: { rewards: Number(rewards) },
      });
    }

    return 'converted';
  } catch (err) {
    console.error('[credits/qualifyingPayment] threw:', err);
    return 'error';
  }
}
