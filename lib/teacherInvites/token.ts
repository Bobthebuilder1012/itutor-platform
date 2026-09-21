// The invite token, and the cookie that carries it across signup.
//
// Server-only: imports next/headers and node:crypto.

import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { INVITE_COOKIE_MAX_AGE_S } from './limits';

export const INVITE_COOKIE = 'class_invite_token';

/** Same shape and entropy as the parent invite token (194). */
export function mintInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Is this string shaped like one of our tokens?
 *
 * Checked before it reaches a query so that a hand-typed or truncated token
 * fails cheaply. Deliberately permissive about length: it guards the shape, not
 * the secret, and the unique index is what actually resolves a token.
 */
export function isTokenShaped(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export async function setInviteCookie(token: string): Promise<void> {
  try {
    const store = await cookies();
    store.set(INVITE_COOKIE, token, {
      httpOnly: true,
      // 'lax', not 'strict'. The token has to survive the top-level GET back
      // from Google OAuth; 'strict' drops the cookie on exactly that hop and
      // the attribution is silently lost for every social signup.
      sameSite: 'lax',
      // Not hardcoded true: that breaks the cookie on http://localhost, where
      // the flow is developed, and the failure looks like "adoption is broken"
      // rather than "the cookie was refused".
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: INVITE_COOKIE_MAX_AGE_S,
    });
  } catch {
    // Outside a request scope, or in a context that cannot set cookies. The
    // visitor still reaches the class; only attribution is at risk.
  }
}

export async function readInviteCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    const value = store.get(INVITE_COOKIE)?.value ?? null;
    return isTokenShaped(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Drop the cookie once it has been adopted.
 *
 * Without this, every subsequent authenticated page load re-runs adoption
 * against a token that is already claimed. That is harmless but not free, and
 * it makes the logs unreadable.
 */
export async function clearInviteCookie(): Promise<void> {
  try {
    const store = await cookies();
    store.set(INVITE_COOKIE, '', { path: '/', maxAge: 0 });
  } catch {
    // Same reasoning as setInviteCookie.
  }
}
