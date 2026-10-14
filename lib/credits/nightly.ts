// The credit programme's nightly job (app/api/cron/credits-nightly). Every
// step is idempotent, so a rerun or an overlap with a webhook is harmless.
//
//   1. reconcile  referrals still 'signed_up' whose friend has a card payment
//                 that should have converted them (a webhook that failed, or
//                 a Stripe lookup that was unavailable)
//   2. mature     rewards whose hold period is over become spendable
//   3. expire     lots past their expiry date are removed
//   4. evaluate   referrers with converted, unrewarded friends get the rewards
//                 they now qualify for — this is what makes lowering the
//                 "friends per reward" setting pay out within a day
//   5. reservations  see lib/credits/reservations.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCreditSettings } from '@/lib/credits/settings';
import { recordQualifyingPayment } from '@/lib/credits/qualifyingPayment';
import { notifyCredits, rewardMessage } from '@/lib/credits/notify';
import { tidyReservations } from '@/lib/credits/reservations';

const RECONCILE_LIMIT = 500;

export interface NightlyResult {
  unavailable?: boolean;
  reconciled: { checked: number; converted: number; rejected: number };
  matured: number;
  expired_ttd: number;
  rewards_issued: number;
  reservations: Awaited<ReturnType<typeof tidyReservations>>;
  errors: string[];
}

export async function runCreditsNightly(admin: SupabaseClient): Promise<NightlyResult> {
  const result: NightlyResult = {
    reconciled: { checked: 0, converted: 0, rejected: 0 },
    matured: 0,
    expired_ttd: 0,
    rewards_issued: 0,
    reservations: { committed: 0, released: 0, cancelled_intents: 0 },
    errors: [],
  };

  const settings = await getCreditSettings(admin, { fresh: true });
  if (!settings) return { ...result, unavailable: true };

  // ── 1. Reconcile missed conversions ────────────────────────────────────
  if (settings.referrals_enabled) {
    const { data: open, error } = await admin
      .from('referrals')
      .select('id, referee_id, created_at')
      .eq('status', 'signed_up')
      .order('created_at', { ascending: true })
      .limit(RECONCILE_LIMIT);
    if (error) result.errors.push(`reconcile: ${error.message}`);

    for (const referral of open ?? []) {
      const since = [settings.referrals_enabled_at, referral.created_at]
        .filter(Boolean)
        .sort()
        .pop() as string;
      const { data: payments } = await admin
        .from('subscription_payments')
        .select('id')
        .or(`student_id.eq.${referral.referee_id},payer_id.eq.${referral.referee_id}`)
        .eq('status', 'PAID')
        .gte('paid_at', since)
        .order('paid_at', { ascending: true })
        .limit(5);

      for (const p of payments ?? []) {
        result.reconciled.checked += 1;
        const outcome = await recordQualifyingPayment(admin, p.id as string);
        if (outcome === 'converted') result.reconciled.converted += 1;
        if (outcome === 'rejected') result.reconciled.rejected += 1;
        if (outcome === 'converted' || outcome === 'rejected') break;
      }
    }
  }

  // ── 2–3. Holds and expiry ──────────────────────────────────────────────
  const { data: matured, error: matureErr } = await admin.rpc('mature_credit_holds');
  if (matureErr) result.errors.push(`mature: ${matureErr.message}`);
  result.matured = Number(matured ?? 0);

  const { data: expired, error: expireErr } = await admin.rpc('expire_credits');
  if (expireErr) result.errors.push(`expire: ${expireErr.message}`);
  result.expired_ttd = Number(expired ?? 0);

  // ── 4. Evaluate everyone with progress ─────────────────────────────────
  if (settings.referrals_enabled) {
    const { data: pending, error } = await admin
      .from('referrals')
      .select('referrer_id')
      .eq('status', 'converted')
      .is('grant_id', null);
    if (error) result.errors.push(`evaluate: ${error.message}`);

    const referrers = Array.from(new Set((pending ?? []).map((r) => r.referrer_id as string)));
    for (const referrerId of referrers) {
      const { data: issued, error: evalErr } = await admin.rpc('evaluate_referral_rewards', {
        p_referrer: referrerId,
      });
      if (evalErr) {
        result.errors.push(`evaluate ${referrerId}: ${evalErr.message}`);
        continue;
      }
      const n = Number(issued ?? 0);
      if (n > 0) {
        result.rewards_issued += n;
        await notifyCredits(admin, {
          userId: referrerId,
          type: 'referral_reward',
          title: 'You earned iTutor credits',
          message: rewardMessage(settings.credit_value_ttd, n, settings.hold_days),
          metadata: { rewards: n },
        });
      }
    }
  }

  // ── 5. Reservations ────────────────────────────────────────────────────
  try {
    result.reservations = await tidyReservations(admin);
  } catch (err) {
    result.errors.push(`reservations: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}
