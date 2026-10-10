// =====================================================
// /r/[code] — attributed campaign redirect
// =====================================================
// Find Your iTutor Build Plan §2.3.
//
// Resolves a creator / Captain / QR / school code, writes attribution, and
// 307s to the Finder (or a ?to= target).
//
// Codes resolve against campaign_codes (migration 267), the named links on
// /admin/link-tracking. Where that table is absent this route accepts any
// string and records it raw, so print and QR assets could go out before it
// existed (plan §2.3).

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
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
  platform: string | null;
  kind: string | null;
  landing_path: string | null;
  active: boolean | null;
}

/**
 * Link-preview fetchers and crawlers. Every platform these links are posted on
 * fetches the URL to draw a preview card (Facebook and Instagram's
 * facebookexternalhit, WhatsApp, Telegram), and each fetch would otherwise be
 * a "click" on /admin/link-tracking.
 *
 * Deliberately a named list, not a bare /bot/: the in-app browsers that carry
 * the real clicks (Instagram, FBAN/FBAV, TikTok's musical_ly / BytedanceWebview)
 * must never match, and neither may phones whose model name ends in "bot".
 */
const CRAWLER_UA =
  /facebookexternalhit|facebot|facebookcatalog|meta-external|whatsapp|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|pinterestbot|redditbot|skypeuripreview|googlebot|google-inspectiontool|bingbot|applebot|bytespider|tiktokspider|petalbot|yandex|baiduspider|duckduckbot|semrushbot|ahrefsbot|embedly|headlesschrome|python-requests|curl\/|wget\//i;

function isCrawler(request: NextRequest): boolean {
  return CRAWLER_UA.test(request.headers.get('user-agent') ?? '');
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
      .select('code, platform, kind, landing_path, active')
      // Codes are stored lowercase (migration 267), so a link typed as
      // /r/Instagram still finds its row.
      .eq('code', code.toLowerCase())
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
  let code = (rawCode ?? '').trim();
  const url = request.nextUrl;

  const requestedTarget = safeRelativePath(url.searchParams.get('to'));

  let landingPath = requestedTarget ?? getFinderLandingPath();
  let resolvedKind: string | null = null;
  let resolvedPlatform: string | null = null;
  let resolution: RefResolution = 'unvalidated';

  if (!CODE_PATTERN.test(code)) {
    // Never 404 a printed link — send the visitor somewhere useful and record
    // that the code was malformed.
    resolution = 'invalid';
  } else {
    const row = await resolveCode(code);

    if (row === undefined) {
      resolution = 'unvalidated'; // campaign_codes absent (pre-Phase 4)
    } else if (row === null) {
      resolution = 'unresolved';
    } else {
      // Record the row's spelling, not the visitor's, so /r/Instagram and
      // /r/instagram count as one link on /admin/link-tracking.
      code = row.code;
      resolvedKind = row.kind ?? null;
      resolvedPlatform = row.platform ?? null;
      if (row.active === false) {
        // A retired code still redirects; it just stops carrying its landing
        // override. Killing the redirect would break assets already in the wild.
        resolution = 'unresolved';
      } else {
        resolution = 'resolved';
        if (!requestedTarget) {
          landingPath = safeRelativePath(row.landing_path) ?? landingPath;
        }
      }
    }
  }

  // Build the attribution for this touch. A /r/ hit is by definition a
  // campaign touch, so it always produces one.
  const attribution: Attribution = {
    ref: code.slice(0, 200) || 'unknown',
    utm_source: url.searchParams.get('utm_source')?.slice(0, 200) || resolvedPlatform || 'ref',
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
  //
  // Not for link-preview crawlers, and not for HEAD (Next answers HEAD with
  // this handler): neither is a person, and both would inflate the clicks on
  // /admin/link-tracking. They still get the redirect.
  if (request.method === 'HEAD' || isCrawler(request)) return response;

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
