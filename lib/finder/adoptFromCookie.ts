/**
 * One line for every claim site: "if this browser has an anonymous Finder run,
 * make it this account's."
 *
 * Server-only. Exists so no call site has to know the cookie name, hold the
 * service client, or remember that a missing cookie is the normal case rather
 * than an error. There are four call sites and they are in four different kinds
 * of file (an OAuth route handler, two server components, a redirect route); the
 * moment any of them grows its own version of this, one of them will drift.
 *
 * Idempotent and silent. Safe to call on every authenticated page load, which is
 * exactly how Class Match Week uses its equivalent — the alternative is trying
 * to identify the single correct moment to claim, and being wrong on whichever
 * path nobody tested.
 */

import { getServiceClient } from '@/lib/supabase/server';
import { readFinderToken } from './token';
import { claimFinderRun, type ClaimFinderResult } from './claim';

export async function adoptFinderRunFromCookie(
  userId: string | null | undefined
): Promise<ClaimFinderResult> {
  const nothing: ClaimFinderResult = { claimed: false, row: null };
  if (!userId) return nothing;

  const token = await readFinderToken();
  if (!token) return nothing;

  try {
    return await claimFinderRun(getServiceClient(), { token, userId });
  } catch (err) {
    // claimFinderRun does not throw, so reaching here means the service client
    // itself could not be built (missing env). Still not worth failing a page
    // render over: the visitor keeps their matches, unclaimed.
    console.warn('[finder] adoptFinderRunFromCookie failed:', err);
    return nothing;
  }
}
