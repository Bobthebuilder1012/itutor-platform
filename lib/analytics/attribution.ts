// =====================================================
// ATTRIBUTION — cookie shape and parsing
// =====================================================
// Find Your iTutor Build Plan §2.2.
//
// Written by middleware.ts before render, so that a server component on /find
// can read it. Never write these client-side: a client-side write loses the
// first hit on slow connections, which is exactly the traffic paid campaigns
// buy (plan §2.2).
//
// Edge-runtime safe — no Node built-ins.

export const ATTR_COOKIE = 'itutor_attr'; // first touch, never overwritten
export const LAST_COOKIE = 'itutor_last'; // last touch, overwritten every visit
export const ANON_COOKIE = 'itutor_anon'; // anonymous id, pre-signup events

export const ATTR_MAX_AGE = 90 * 24 * 60 * 60; // 90 days
export const ANON_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

/** Query params that mark a visit as attributed. */
export const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'ref',
] as const;

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  ref?: string;
  /** Landing path of the touch, for debugging a funnel that looks wrong. */
  path?: string;
  /** ISO timestamp of the touch. */
  at?: string;
}

/**
 * Pull attribution out of a URL's query string.
 * Returns null when no attribution param is present, so callers can tell an
 * unattributed visit (leave first_touch alone) from an attributed one.
 */
export function readAttributionFromUrl(url: URL, path?: string): Attribution | null {
  const attr: Attribution = {};
  let found = false;

  for (const key of UTM_PARAMS) {
    const value = url.searchParams.get(key);
    if (value) {
      // Cap length: these land in a cookie and a jsonb column, and the query
      // string is attacker-controlled.
      attr[key] = value.slice(0, 200);
      found = true;
    }
  }

  if (!found) return null;

  attr.path = (path ?? url.pathname).slice(0, 300);
  attr.at = new Date().toISOString();
  return attr;
}

/** Parse a cookie value written by serializeAttribution. Never throws. */
export function parseAttribution(raw: string | undefined | null): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Attribution;
    }
    return null;
  } catch {
    // A malformed cookie must not break navigation or event writes.
    return null;
  }
}

export function serializeAttribution(attr: Attribution): string {
  return encodeURIComponent(JSON.stringify(attr));
}
