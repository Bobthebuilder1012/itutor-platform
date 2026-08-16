/**
 * Safe post-auth redirect resolution.
 *
 * The login and signup pages both accept a `?redirect=` param and send the
 * visitor there once they are authenticated. Pushed unchecked, that is an open
 * redirect: `/signup?redirect=//evil.example` hands a freshly-authenticated
 * user straight off-site, on a URL that looks like ours.
 *
 * `app/auth/callback/route.ts` already guarded this correctly; the client
 * pages did not. The rule lives here now so there is one definition of
 * "somewhere we are willing to send a user", shared by both.
 *
 * Two details that matter:
 *
 * 1. **Decode, then validate.** The client pages did
 *    `router.push(decodeURIComponent(param))`. `useSearchParams().get()` has
 *    already decoded once, so that second decode is what actually reaches the
 *    router — and validating before it would let a doubly-encoded value slip
 *    past. `safeRedirectPath` keeps the existing decode and validates its
 *    result. The callback route reads an already-decoded param and does not
 *    decode again, so it uses `isSameOriginPath` directly.
 *
 * 2. **Backslashes count as slashes.** Browsers normalise `\` to `/` in the
 *    authority position, so `/\evil.example` is protocol-relative in practice
 *    even though it fails a naive `startsWith('//')` test.
 */

/** Absolute same-origin paths only — no scheme, no host, no protocol-relative. */
export function isSameOriginPath(value: string): boolean {
  if (!value.startsWith('/')) return false;
  // `//host` and `/\host` both resolve to a different origin.
  if (value.startsWith('//') || value.startsWith('/\\')) return false;
  return true;
}

/**
 * Resolve a `?redirect=` param to a destination that is safe to navigate to.
 *
 * @param raw The param as read from the URL, possibly percent-encoded.
 * @returns The decoded same-origin path, or `null` if absent or unsafe.
 */
export function safeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding throws. Treat it as no destination rather
    // than navigating to something we could not parse.
    return null;
  }

  return isSameOriginPath(decoded) ? decoded : null;
}

/**
 * Resolve a `?redirect=` param, falling back to a default when it is absent
 * or unsafe. The common shape at the call sites, which all had a role-specific
 * dashboard to fall back to.
 */
export function safeRedirectOr(raw: string | null | undefined, fallback: string): string {
  return safeRedirectPath(raw) ?? fallback;
}
