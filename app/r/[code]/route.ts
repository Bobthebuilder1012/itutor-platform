// =====================================================
// /r/[code] — attributed campaign redirect
// =====================================================
// Find Your iTutor Build Plan §2.3.
//
// Resolves a creator / Captain / QR / school code, writes attribution, and
// 307s to the Finder (or a ?to= target).
//
// Codes resolve against campaign_codes, which arrives in Phase 4. Until then
// this route accepts any string and records it raw, so print and QR assets can
// go out early without waiting on Phase 4 (plan §2.3).
//
// A student's or parent's referral code (referral_codes, migration 268) is
// checked FIRST. Besides the usual attribution it sets its own cookie,
// itutor_referral: first-touch attribution keeps the visitor's first ever
// campaign, so a friend's link clicked after an Instagram visit would
// otherwise never reach signup. See lib/credits/attachReferral.ts.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  parseReferralCookie,
  resolveReferralCode,
  serializeReferralCookie,
} from '@/lib/credits/referralCodes';
import { getCreditSettings } from '@/lib/credits/settings';
import {
  ATTR_COOKIE,
  LAST_COOKIE,
  ANON_COOKIE,
  ATTR_MAX_AGE,
  ANON_MAX_AGE,
  parseAttribution,
  serializeAttribution,
  type Attribution,
} from '@/lib/analytics/attribution';
import { getFinderLandingPath } from '@/lib/featureFlags/finder';
import { PRODUCT_EVENTS, type RefResolution } from '@/lib/analytics/events';

export const dynamic = 'force-dynamic';

/** Codes appear in print and QR assets, so keep the accepted shape tight. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

interface CampaignCodeRow {
  code: string;
  kind: string | null;
  landing_path: string | null;
  active: boolean | null;
}

/**
 * Resolve a code against campaign_codes.
 *
 * Returns `undefined` when the table does not exist yet (pre-Phase 4) so the
 * caller can fall through to accepting the code raw. Distinguishing "table
 * absent" from "code not found" matters: the first must still redirect, the
 * second must still redirect but be recorded as unresolved.
 */
async function resolveCode(code: string): Promise<CampaignCodeRow | null | undefined> {
  try {
    const service = getServiceClient();
    const { data, error } = await service
      .from('campaign_codes')
      .select('code, kind, landing_path, active')
      .eq('code', code)
      .maybeSingle();

    if (error) {
      // 42P01 = undefined_table. Phase 4 has not landed; accept raw.
      if (error.code === '42P01') return undefined;
      console.error('[r/code] lookup failed:', error.message);
      return undefined;
    }

    return (data as CampaignCodeRow | null) ?? null;
  } catch (err) {
    console.error('[r/code] lookup threw:', err);
    return undefined;
  }
}

/**
 * A student's or parent's referral code. `enabled` is false while the
 * referral programme is switched off: the link still redirects and is still
 * counted, it just stops earning anyone a reward.
 */
async function resolveReferralLink(code: string): Promise<{ code: string; enabled: boolean } | null> {
  try {
    const service = getServiceClient();
    const row = await resolveReferralCode(service, code);
    if (!row) return null;
    const settings = await getCreditSettings(service);
    return { code: row.code, enabled: settings?.referrals_enabled === true };
  } catch (err) {
    console.error('[r/code] referral lookup threw:', err);
    return null;
  }
}

/**
 * Only ever redirect to a path on this origin.
 *
 * `?to=` is attacker-controllable and these links are printed on physical
 * assets people are told to trust, so an open redirect here would be a
 * phishing primitive with our domain on the front of it. Protocol-relative
 * (`//evil.com`) and backslash (`/\evil.com`) forms are rejected alongside
 * absolute URLs.
 */
function safeRelativePath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (raw.includes('://')) return null;
  return raw.slice(0, 500);
}

export async function GET(
  request: NextRequest,
  // Next 14 passes params as a plain object (15 made it a Promise). Typed for
  // 14 to match the rest of the app; `await` below is harmless either way and
  // keeps this working if the app moves to 15.
  { params }: { params: { code: string } }
) {
  const { code: rawCode } = await params;
  const code = (rawCode ?? '').trim();
  const url = request.nextUrl;

  const requestedTarget = safeRelativePath(url.searchParams.get('to'));

  let landingPath = requestedTarget ?? getFinderLandingPath();
  let resolvedKind: string | null = null;
  let resolution: RefResolution = 'unvalidated';
  // Set when this is a friend's referral link and the programme is on.
  let referralCode: string | null = null;

  const referral = CODE_PATTERN.test(code) ? await resolveReferralLink(code) : null;

  if (!CODE_PATTERN.test(code)) {
    // Never 404 a printed link — send the visitor somewhere useful and record
    // that the code was malformed.
    resolution = 'invalid';
  } else if (referral) {
    code = referral.code;
    resolvedKind = 'referral';
    resolvedPlatform = 'referral';
    resolution = 'resolved';
    referralCode = referral.enabled ? referral.code : null;
  } else {
    const row = await resolveCode(code);

    if (row === undefined) {
      resolution = 'unvalidated'; // campaign_codes absent (pre-Phase 4)
    } else if (row === null) {
      resolution = 'unresolved';
    } else if (row.active === false) {
      // A retired code still redirects; it just stops carrying its landing
      // override. Killing the redirect would break assets already in the wild.
      resolution = 'unresolved';
      resolvedKind = row.kind ?? null;
    } else {
      resolution = 'resolved';
      resolvedKind = row.kind ?? null;
      if (!requestedTarget) {
        landingPath = safeRelativePath(row.landing_path) ?? landingPath;
      }
    }
  }

  // Build the attribution for this touch. A /r/ hit is by definition a
  // campaign touch, so it always produces one.
  const attribution: Attribution = {
    ref: code.slice(0, 200) || 'unknown',
    utm_source: url.searchParams.get('utm_source')?.slice(0, 200) || 'ref',
    utm_medium: url.searchParams.get('utm_medium')?.slice(0, 200) || resolvedKind || 'referral',
    utm_campaign: url.searchParams.get('utm_campaign')?.slice(0, 200) || undefined,
    utm_content: url.searchParams.get('utm_content')?.slice(0, 200) || undefined,
    path: `/r/${code}`.slice(0, 300),
    at: new Date().toISOString(),
  };

  const destination = new URL(landingPath, request.url);
  // Carry the code through so the landing page can render campaign copy
  // without re-reading the cookie.
  if (!destination.searchParams.has('ref')) {
    destination.searchParams.set('ref', code || 'unknown');
  }

  const response = NextResponse.redirect(destination, 307);

  const serialized = serializeAttribution(attribution);
  const cookieBase = {
    path: '/',
    sameSite: 'lax' as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  };

  // First touch only — never overwrite. A visitor who arrived on a Captain
  // link last month and a creator link today stays credited to the Captain.
  if (!parseAttribution(request.cookies.get(ATTR_COOKIE)?.value)) {
    response.cookies.set({
      ...cookieBase,
      name: ATTR_COOKIE,
      value: serialized,
      maxAge: ATTR_MAX_AGE,
    });
  }

  response.cookies.set({
    ...cookieBase,
    name: LAST_COOKIE,
    value: serialized,
    maxAge: ATTR_MAX_AGE,
  });

  let anonId = request.cookies.get(ANON_COOKIE)?.value ?? null;
  if (!anonId) {
    anonId = crypto.randomUUID();
    response.cookies.set({
      ...cookieBase,
      name: ANON_COOKIE,
      value: anonId,
      maxAge: ANON_MAX_AGE,
    });
  }

  // Record the click itself. This is a pre-signup touch, so it is anon-keyed;
  // it is the only record that a printed asset was ever scanned.

  // A friend's referral link. First referral wins, like first-touch: a
  // second friend's link does not take the credit from the first.
  if (referralCode && !parseReferralCookie(request.cookies.get(REFERRAL_COOKIE)?.value)) {
    response.cookies.set({
      ...cookieBase,
      name: REFERRAL_COOKIE,
      value: serializeReferralCookie({ code: referralCode, at: new Date().toISOString() }),
      maxAge: REFERRAL_COOKIE_MAX_AGE,
    });
  }

  try {
    const service = getServiceClient();
    await service.from('product_events').insert({
      user_id: null,
      anon_id: anonId,
      event: PRODUCT_EVENTS.REF_CLICK,
      props: { code, resolution, kind: resolvedKind, destination: landingPath },
      attribution,
    });
  } catch (err) {
    // A redirect must never fail because analytics did.
    console.error('[r/code] failed to record click:', err);
  }

  return response;
}
