/**
 * The OAuth `state` for connecting a tutor's Google Meet or Zoom account.
 *
 * Server-only (node:crypto, TOKEN_ENCRYPTION_KEY).
 *
 * The callbacks used to take the tutor id straight out of `state`
 * ("userId|returnPath") and store the returned tokens against it with the
 * service role. Anyone could start a Google consent screen with a victim's id
 * in `state` and have THEIR Google account become the victim's meeting host —
 * tutor ids are readable through groups.tutor_id. The return path was used
 * as-is too, so the callback would redirect to any site.
 *
 * Now `state` is signed and carries a nonce that must match an HttpOnly cookie
 * set on the browser that started the flow, and the callback also requires the
 * signed-in user to be the one named in it. The return path is same-site only.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { NextResponse } from 'next/server';

export type OAuthProvider = 'google' | 'zoom';

const MAX_AGE_SECONDS = 10 * 60;
export const DEFAULT_OAUTH_RETURN = '/tutor/video-setup';

export function oauthNonceCookieName(provider: OAuthProvider): string {
  return `itutor_oauth_${provider}`;
}

/** Scoped to /api/auth so the nonce is only ever sent to the connect/callback routes. */
const COOKIE_PATH = '/api/auth';

function signingKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  // Derived rather than used raw, so the state signature and the token
  // encryption never share a key.
  return createHmac('sha256', 'itutor-oauth-state-v1').update(secret).digest();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', signingKey()).update(payload).digest());
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * A path on this site, or the fallback. Refuses absolute URLs, protocol-
 * relative "//evil", backslashes (which browsers read as slashes) and control
 * characters.
 */
export function safeReturnPath(from: unknown, fallback: string = DEFAULT_OAUTH_RETURN): string {
  if (typeof from !== 'string' || from.length === 0 || from.length > 512) return fallback;
  if (!from.startsWith('/') || from.startsWith('//')) return fallback;
  if (from.includes('\\') || /[\u0000-\u001f\u007f]/.test(from)) return fallback;
  return from;
}

/** The origin a request arrived on, as the browser saw it (Vercel sits behind a proxy). */
function requestOrigin(request: Request): string | null {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return null;
  const isLocal = host.startsWith('localhost') || host.startsWith('127.');
  const proto = request.headers.get('x-forwarded-proto') ?? (isLocal ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Where to send a /connect request that started on a different host from the
 * one the provider will return to, or null when they already match.
 *
 * The nonce cookie and the Supabase session cookie are both host-only, so a
 * tutor who starts on one host (a preview URL, the *.vercel.app alias) and is
 * returned by Zoom or Google to another (the fixed ZOOM_REDIRECT_URI /
 * GOOGLE_REDIRECT_URI host) arrives at the callback with neither, and the
 * callback has to refuse. Restarting /connect on the callback's host puts both
 * cookies where the callback will look. If the tutor isn't signed in there,
 * /connect sends them to log in on that host, which is the honest answer.
 */
export function connectOnCallbackHost(request: Request, redirectUri: string): string | null {
  let target: URL;
  try {
    target = new URL(redirectUri);
  } catch {
    return null;
  }
  const here = requestOrigin(request);
  if (!here || here === target.origin) return null;
  const url = new URL(request.url);
  return `${target.origin}${url.pathname}${url.search}`;
}

/** Build `state` for the consent URL, and the nonce to set as a cookie on the redirect. */
export function createOAuthState(
  userId: string,
  from: string | null | undefined,
  provider: OAuthProvider,
): { state: string; nonce: string } {
  const nonce = b64url(randomBytes(18));
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        u: userId,
        f: safeReturnPath(from),
        n: nonce,
        p: provider,
        t: Math.floor(Date.now() / 1000),
      }),
    ),
  );
  return { state: `${payload}.${sign(payload)}`, nonce };
}

export function setOAuthNonceCookie(res: NextResponse, provider: OAuthProvider, nonce: string): void {
  res.cookies.set(oauthNonceCookieName(provider), nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax, not Strict: the callback is a top-level GET navigation from Google
    // or Zoom, which Strict would strip the cookie from.
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearOAuthNonceCookie(res: NextResponse, provider: OAuthProvider): void {
  res.cookies.set(oauthNonceCookieName(provider), '', { path: COOKIE_PATH, maxAge: 0 });
}

export type VerifiedOAuthState =
  | { ok: true; userId: string; returnTo: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'wrong_provider' | 'expired' | 'nonce_mismatch'; returnTo: string };

/**
 * Check a callback's `state` against the nonce cookie. `returnTo` is always a
 * safe path, so a failure can still send the tutor back where they started.
 * The legacy unsigned "userId|path" form is refused.
 */
export function verifyOAuthState(
  stateRaw: string | null | undefined,
  cookieNonce: string | null | undefined,
  provider: OAuthProvider,
): VerifiedOAuthState {
  const parts = (stateRaw ?? '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed', returnTo: DEFAULT_OAUTH_RETURN };
  }
  const [payload, sig] = parts;
  if (!safeEqual(sig, sign(payload))) {
    return { ok: false, reason: 'bad_signature', returnTo: DEFAULT_OAUTH_RETURN };
  }

  let body: { u?: unknown; f?: unknown; n?: unknown; p?: unknown; t?: unknown };
  try {
    body = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed', returnTo: DEFAULT_OAUTH_RETURN };
  }
  const returnTo = safeReturnPath(body.f);

  if (body.p !== provider) return { ok: false, reason: 'wrong_provider', returnTo };
  const age = Math.floor(Date.now() / 1000) - Number(body.t);
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_SECONDS) return { ok: false, reason: 'expired', returnTo };
  if (typeof body.n !== 'string' || !cookieNonce || !safeEqual(body.n, cookieNonce)) {
    return { ok: false, reason: 'nonce_mismatch', returnTo };
  }
  if (typeof body.u !== 'string' || !body.u) return { ok: false, reason: 'malformed', returnTo };
  return { ok: true, userId: body.u, returnTo };
}
