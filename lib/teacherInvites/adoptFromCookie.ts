// One line for every place an account might first become authenticated.
//
// Adoption is cheap, idempotent and silent, so the right strategy is to call it
// at every plausible moment rather than at the one moment that looks right.
// The moment that looks right is registration; the moments that actually matter
// in production are the OAuth callback (no registration route runs at all) and
// the first class page load (the cookie was set on a phone and the signup
// finished on a laptop).

import { getServiceClient } from '@/lib/supabase/server';
import { claimClassInvite, recordLinkArrival } from './claim';
import { readInviteCookie, clearInviteCookie } from './token';

/**
 * Adopt whatever invite token this browser is carrying onto the given user.
 *
 * Never throws. Resolves an addressed invitation first, then falls back to a
 * shared class link, which is a different kind of token and produces a row
 * rather than claiming one.
 */
export async function adoptClassInviteFromCookie(userId: string): Promise<void> {
  try {
    const token = await readInviteCookie();
    if (!token || !userId) return;

    const admin = getServiceClient();

    const result = await claimClassInvite(admin, { token, userId });
    if (result.claimed) {
      await clearInviteCookie();
      return;
    }

    // Not an addressed invitation. It may be a class's shared link.
    if (result.reason === 'not_found') {
      const { data } = await admin
        .from('groups')
        .select('id, tutor_id')
        .eq('invite_link_token', token)
        .maybeSingle();
      const group = data as { id: string; tutor_id: string } | null;
      if (group) {
        await recordLinkArrival(admin, {
          groupId: group.id,
          tutorId: group.tutor_id,
          userId,
        });
        await clearInviteCookie();
        return;
      }
    }

    // Expired, revoked, self-followed or simply unresolvable. Drop the cookie
    // so it stops being retried on every authenticated page load for a week.
    if (result.reason !== 'error') await clearInviteCookie();
  } catch (err) {
    console.warn('[classInvites] adoptFromCookie threw:', err);
  }
}
