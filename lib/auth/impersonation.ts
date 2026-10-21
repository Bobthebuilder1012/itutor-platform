// =====================================================
// ADMIN IMPERSONATION — shared cookie contract
// =====================================================
// Entering a student account replaces the admin's session cookies with a real
// session for that student: not a view-only mode, an actual login. Two cookies
// survive the swap and are the only trace of it in the browser:
//
//   IMPERSONATION_COOKIE  readable by client JS. Carries only labels, so the
//                         banner can say whose account this is. Never trusted
//                         for authorization — anyone can forge it, and forging
//                         it buys nothing but a misleading banner.
//   IMPERSONATOR_COOKIE   httpOnly. Holds the admin's own refresh token so the
//                         Exit button can put the admin back without a second
//                         password login. This one IS a credential; it is
//                         httpOnly + secure + sameSite strict, and short-lived.
//
// Both are cleared on exit.

export const IMPERSONATION_COOKIE = 'itutor_impersonation';
export const IMPERSONATOR_COOKIE = 'itutor_impersonator';

// The admin's return ticket outlives a long debugging session but not a day.
// Past this, exiting just lands on /login and they sign in again.
export const IMPERSONATOR_COOKIE_MAX_AGE = 60 * 60 * 4; // 4 hours

export interface ImpersonationState {
  studentId: string;
  studentEmail: string;
  studentName: string;
  adminEmail: string;
  startedAt: string;
}

/**
 * Parse the readable impersonation cookie. Returns null on anything malformed —
 * a bad value means "not impersonating", never an exception, because this runs
 * in a banner that renders on every page.
 */
export function parseImpersonationState(raw: string | undefined | null): ImpersonationState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed?.studentId || !parsed?.studentEmail) return null;
    return parsed as ImpersonationState;
  } catch {
    return null;
  }
}

/** Read the readable cookie from document.cookie. Browser only. */
export function readImpersonationStateFromDocument(): ImpersonationState | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${IMPERSONATION_COOKIE}=`));
  return parseImpersonationState(match?.slice(IMPERSONATION_COOKIE.length + 1));
}
