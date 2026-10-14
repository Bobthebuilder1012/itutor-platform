// Referral codes: one permanent code per student or parent account, shared as
// https://myitutor.com/r/<code>. Server-only (service client).
//
// Codes live in referral_codes (migration 268), which /r/ checks before
// campaign_codes. They are lowercase because /r/ lowercases before looking
// anything up, and they avoid characters that read alike on a phone screen
// (0/o, 1/l/i) because people type them from WhatsApp messages.

import { randomInt } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingSchema } from '@/lib/supabase/schemaErrors';

/** The public host, never NEXT_PUBLIC_APP_URL (previews point that elsewhere). */
export const PUBLIC_BASE = 'https://myitutor.com';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;

export const REFERRAL_COOKIE = 'itutor_referral';
export const REFERRAL_COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90 days, like first-touch

export interface ReferralCookie {
  code: string;
  /** When the link was clicked. The account must be created after it. */
  at: string;
}

export function serializeReferralCookie(value: ReferralCookie): string {
  return encodeURIComponent(JSON.stringify(value));
}

export function parseReferralCookie(raw: string | null | undefined): ReferralCookie | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<ReferralCookie>;
    if (typeof parsed.code !== 'string' || typeof parsed.at !== 'string') return null;
    if (!/^[a-z0-9-]{4,32}$/.test(parsed.code)) return null;
    if (Number.isNaN(Date.parse(parsed.at))) return null;
    return { code: parsed.code, at: parsed.at };
  } catch {
    return null;
  }
}

export function referralLink(code: string): string {
  return `${PUBLIC_BASE}/r/${code}`;
}

function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** The account a referral code belongs to, or null. Undefined = table absent. */
export async function resolveReferralCode(
  admin: SupabaseClient,
  code: string
): Promise<{ user_id: string; code: string } | null | undefined> {
  const { data, error } = await admin
    .from('referral_codes')
    .select('user_id, code')
    .eq('code', code.toLowerCase())
    .maybeSingle();
  if (error) {
    if (!isMissingSchema(error)) console.error('[referralCodes] lookup failed:', error.message);
    return undefined;
  }
  return (data as { user_id: string; code: string } | null) ?? null;
}

/**
 * This account's code, created on first call. Returns null when credits are
 * not set up here (migration 268 absent). Codes never collide with a tracked
 * campaign link or a credit code, so /r/<code> and /redeem/<code> stay
 * unambiguous.
 */
export async function getOrCreateReferralCode(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data: existing, error } = await admin
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return null;
    throw new Error(`referral_codes read failed: ${error.message}`);
  }
  if (existing?.code) return existing.code as string;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCode();

    const [{ data: campaign }, { data: creditCode }] = await Promise.all([
      admin.from('campaign_codes').select('code').eq('code', code).maybeSingle(),
      admin.from('credit_codes').select('code').ilike('code', code).maybeSingle(),
    ]);
    // Either table may be absent here; an error just means "no clash found".
    if (campaign || creditCode) continue;

    const { error: insErr } = await admin.from('referral_codes').insert({ user_id: userId, code });
    if (!insErr) return code;
    if (insErr.code === '23505') {
      // Either this code was taken, or a parallel request created this user's
      // code first. Prefer theirs.
      const { data: raced } = await admin.from('referral_codes').select('code').eq('user_id', userId).maybeSingle();
      if (raced?.code) return raced.code as string;
      continue;
    }
    throw new Error(`referral_codes insert failed: ${insErr.message}`);
  }
  throw new Error('Could not generate a unique referral code');
}
