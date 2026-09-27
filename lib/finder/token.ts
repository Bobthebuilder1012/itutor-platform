/**
 * The `finder_token` cookie — a Finder run's identity before an account exists.
 *
 * Server-only. Imports `next/headers`.
 *
 * WHY httpOnly, AND WHY IT IS NOT DECORATION. Safari's ITP caps cookies written
 * by *script* at 24 hours after a cross-site navigation. The Google OAuth round
 * trip is that navigation. A token in localStorage or a script-set cookie
 * therefore gets discarded on exactly the path we most need it to survive, and
 * the family comes back from Google having lost every answer. Class Match Week
 * hit this and documented it (`app/api/class-match/submission/route.ts`); this
 * is the same problem with the same solution.
 *
 * WHY IT IS MINTED IN A ROUTE HANDLER AND NOWHERE ELSE. Next 14 server
 * components cannot set cookies — `getServerClient()` in lib/supabase/server.ts
 * implements only a `get` adapter for that reason. Middleware can, but
 * `middleware.ts` returns early for every `/api/*` path *without* applying
 * cookies, so it could not stamp the submit POST even if we wanted it to; and
 * minting per page view would create tokens with no row behind them. So the
 * token is minted by POST /api/finder/submit, at the moment there is a row for
 * it to name.
 *
 * SIX HOURS, NOT SIXTY DAYS. Long enough to cover the OAuth hop, a six-digit
 * email code read on another device, and being interrupted. Short enough that
 * coming back tomorrow is unambiguously a new visit — which is the owner's
 * decision: a return visit starts the questionnaire fresh. CMW's 60 days is a
 * campaign redemption window and would resurrect stale answers here.
 *
 * ONE TOKEN NAMES ONE RUN. A fresh token is minted on every completed
 * submission rather than being reused, because `finder_requests` is
 * many-rows-per-person (`run_number` records drift) while the token is UNIQUE.
 * Reusing it would force re-runs to overwrite the row and throw that drift away.
 */

import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

export const FINDER_TOKEN_COOKIE = 'finder_token';

/** 6 hours. See the header. */
export const FINDER_TOKEN_MAX_AGE = 60 * 60 * 6;

/** 256 bits, url-safe. Same shape and strength as CMW's cmw_token. */
export function mintFinderToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * The token on this request, or null.
 *
 * Never throws: `cookies()` throws outside a request scope (a cron invocation),
 * and a claim helper that blew up there would take down whatever called it.
 */
export async function readFinderToken(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(FINDER_TOKEN_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Attach a freshly minted token to a Route Handler's response.
 *
 * `secure` is environment-dependent rather than hardcoded true: Safari drops
 * secure cookies on `http://localhost`, so hardcoding it breaks local
 * development in a way that looks like a logic bug. Matches what
 * `middleware.ts`'s applyCookies already does for the attribution cookies.
 */
export async function setFinderToken(token: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: FINDER_TOKEN_COOKIE,
    value: token,
    maxAge: FINDER_TOKEN_MAX_AGE,
    path: '/',
    sameSite: 'lax', // must survive the top-level GET back from Google
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}
