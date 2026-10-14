// Turn a friend's referral link into a referrals row, at the moment a NEW
// account is created.
//
// Called from the two places a profile is born:
//   * POST /api/auth/register          (email signups)
//   * bootstrapProfileIfMissing        (Google and every other OAuth signup)
// Attribution is read only here, at signup, so an existing account can never
// be claimed as a referral afterwards.
//
// Never throws: a lost referral costs a friend their reward, not this person
// their account. The parent/child, sibling and payment checks happen later,
// when the friend pays (lib/credits/qualifyingPayment.ts) — at signup there is
// no parent link yet and no payer to compare.

import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';
import { getCreditSettings } from '@/lib/credits/settings';
import { REFERRAL_COOKIE, parseReferralCookie, resolveReferralCode } from '@/lib/credits/referralCodes';

async function clearCookie(): Promise<void> {
  try {
    const store = await cookies();
    store.set({ name: REFERRAL_COOKIE, value: '', path: '/', maxAge: 0 });
  } catch {
    // Not in a context that can set cookies (e.g. a server component). The
    // cookie expires on its own and a second attach is a no-op anyway.
  }
}

/**
 * @param accountCreatedAt when the auth account was created. The referral link
 *   must have been clicked before it — a link opened by an existing account
 *   does not make that account a new friend.
 */
export async function attachReferralFromCookie(userId: string, accountCreatedAt?: string | null): Promise<void> {
  try {
    const store = await cookies();
    const cookie = parseReferralCookie(store.get(REFERRAL_COOKIE)?.value);
    if (!cookie || !userId) return;

    const admin = getServiceClient();
    const settings = await getCreditSettings(admin);
    if (!settings?.referrals_enabled) return;

    const owner = await resolveReferralCode(admin, cookie.code);
    if (!owner) {
      if (owner === null) await clearCookie();
      return;
    }
    if (owner.user_id === userId) {
      // Their own link, opened before signing up a second account? No: this IS
      // the owner's account. Nothing to record.
      await clearCookie();
      return;
    }

    const createdAt = accountCreatedAt ? Date.parse(accountCreatedAt) : Date.now();
    if (Number.isFinite(createdAt) && createdAt < Date.parse(cookie.at)) {
      // The account existed before the link was clicked: not a new friend.
      await clearCookie();
      return;
    }

    const { data: referrer } = await admin
      .from('profiles')
      .select('id, role, is_suspended')
      .eq('id', owner.user_id)
      .maybeSingle();
    if (!referrer || (referrer.role !== 'student' && referrer.role !== 'parent')) {
      await clearCookie();
      return;
    }

    const { error } = await admin.from('referrals').insert({
      referrer_id: owner.user_id,
      referee_id: userId,
      code: owner.code,
      status: 'signed_up',
      clicked_at: cookie.at,
    });
    // 23505: this account was already referred (unique referee). First wins.
    if (error && error.code !== '23505') {
      console.error('[credits/attachReferral] insert failed:', error.message);
      return;
    }
    await clearCookie();
  } catch (err) {
    console.warn('[credits/attachReferral] threw:', err);
  }
}
