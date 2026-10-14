// Campaign (credit) codes: generation, validation, and the plain-language
// answer to every way a redemption can be refused.
//
//   batch codes  10 characters from an alphabet without look-alikes (no 0, O,
//                1 or I), so a code read off a printed card is typed right
//   promo codes  chosen by an admin: 4–24 letters, digits or hyphens
//
// Every code is stored uppercase and matched case-insensitively. A code must
// be unique across both kinds, and may not match a student's referral code or
// a tracked campaign link, so /redeem/<code> and /r/<code> stay unambiguous.

import { randomInt } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const BATCH_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const BATCH_CODE_LENGTH = 10;
export const MAX_BATCH_SIZE = 5000;
export const PROMO_CODE_PATTERN = /^[A-Z0-9-]{4,24}$/;

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function generateBatchCode(): string {
  let out = '';
  for (let i = 0; i < BATCH_CODE_LENGTH; i++) out += BATCH_ALPHABET[randomInt(BATCH_ALPHABET.length)];
  return out;
}

/** Why a promo code cannot be used, or null if it can. */
export async function promoCodeProblem(admin: SupabaseClient, raw: string): Promise<string | null> {
  const code = normaliseCode(raw);
  if (!PROMO_CODE_PATTERN.test(code)) {
    return 'A promo code is 4 to 24 letters, numbers or hyphens.';
  }
  const [{ data: existing }, { data: referral }, { data: link }] = await Promise.all([
    admin.from('credit_codes').select('id').eq('code', code).maybeSingle(),
    admin.from('referral_codes').select('user_id').eq('code', code.toLowerCase()).maybeSingle(),
    admin.from('campaign_codes').select('code').eq('code', code.toLowerCase()).maybeSingle(),
  ]);
  if (existing) return 'That code is already in use.';
  if (referral) return 'That code matches a student’s referral code. Choose another.';
  if (link) return 'That code matches a tracked campaign link. Choose another.';
  return null;
}

/**
 * Insert `count` new unique batch codes for a campaign, in chunks. Collisions
 * (vanishingly rare at 32^10) are retried. Returns how many were created.
 */
export async function createBatchCodes(admin: SupabaseClient, campaignId: string, count: number): Promise<number> {
  let created = 0;
  let attempts = 0;
  while (created < count && attempts < 20) {
    attempts += 1;
    const want = Math.min(500, count - created);
    const batch = new Set<string>();
    while (batch.size < want) batch.add(generateBatchCode());
    const rows = Array.from(batch).map((code) => ({ campaign_id: campaignId, code, max_uses: 1 }));
    const { data, error } = await admin
      .from('credit_codes')
      .upsert(rows, { onConflict: 'code', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`credit_codes insert failed: ${error.message}`);
    created += (data ?? []).length;
  }
  if (created < count) throw new Error(`Only ${created} of ${count} codes could be created`);
  return created;
}

/** What to tell a person whose redemption was refused (spec §10). */
export const REDEEM_MESSAGES: Record<string, string> = {
  codes_disabled: 'Codes are not being accepted right now.',
  locked_out: 'Too many incorrect codes. Please wait 15 minutes and try again.',
  not_eligible_role: 'Codes are for student and parent accounts.',
  suspended: 'This account is suspended.',
  not_found: 'We couldn’t find that code. Check it and try again.',
  not_started: 'This code isn’t active yet.',
  ended: 'This code has ended.',
  paused: 'This code is paused at the moment. Please try again later.',
  already_used: 'This code has already been used.',
  already_redeemed: 'You’ve already redeemed this code.',
  max_reached: 'This code has reached its limit.',
  not_eligible: 'This code is only for new accounts.',
};

export const REDEEM_STATUS: Record<string, number> = {
  codes_disabled: 403,
  locked_out: 429,
  not_eligible_role: 403,
  suspended: 403,
  not_found: 404,
  not_started: 409,
  ended: 410,
  paused: 409,
  already_used: 409,
  already_redeemed: 409,
  max_reached: 409,
  not_eligible: 403,
};
