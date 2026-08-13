// POST /api/parent/self-pay/revoke-all — handover §7, step 4.
//
// "Completing a password change and signing in turns self-pay back off for every
// child on the account."
//
// This is the recovery path for the case the whole §7 design is built around: a
// child who enabled self-pay on their parent's already-unlocked phone. The parent
// gets the security alert, secures the account, and the setting reverts without
// them having to hunt for it — which matters, because a parent who has just been
// told someone used their account should not also have to learn the product's
// settings tree.
//
// WHY THIS IS A ROUTE AND NOT A DATABASE HOOK, AND THE LIMIT OF THAT
// §7 asks for this "as a hook on successful password reset, not a manual step".
// Password changes in this app happen client-side through
// supabase.auth.updateUser(), so there is no server-side moment to hang a
// trigger on. This endpoint is the nearest equivalent: /reset-password calls it
// the instant the password update succeeds. Authorisation comes from the
// session, not from a body parameter, so it can only ever act on the caller's
// own account.
//
// The honest limitation: a client that never reaches the call — closed tab,
// dropped connection — leaves self-pay on. A Supabase Auth Hook on the
// password-changed event would close that gap and is the right follow-up; it is
// noted here rather than left implicit. The endpoint is idempotent, so the
// parent visiting Settings later and toggling it off reaches the same state.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { revokeAllSelfPay } from '@/lib/server/childBilling';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();

    // Not an error worth surfacing: the reset page calls this unconditionally,
    // and a student or tutor resetting their password simply has nothing to
    // revoke.
    if (!user) return NextResponse.json({ ok: true, revoked: 0 });

    const admin = getServiceClient();

    const { revoked } = await revokeAllSelfPay(admin, user.id);

    if (revoked > 0) {
      // Told, not silent. A parent who deliberately enabled self-pay and then
      // changed their password for unrelated reasons would otherwise discover
      // the reversal only when their child's next booking landed in the approval
      // queue.
      try {
        await admin.from('notifications').insert({
          user_id: user.id,
          type: 'payment',
          title: 'Self-pay turned off',
          message:
            revoked === 1
              ? 'Changing your password turned self-pay back off for 1 child. Their bookings need your approval again.'
              : `Changing your password turned self-pay back off for ${revoked} children. Their bookings need your approval again.`,
          link: '/parent/settings',
          is_read: false,
        });
      } catch {
        /* notification must not fail the revocation */
      }
    }

    return NextResponse.json({ ok: true, revoked });
  } catch (err) {
    console.error('[POST /api/parent/self-pay/revoke-all]', err);
    // Still 200: this is called from a success path in the password reset flow,
    // and a failure here must not make a completed password change look broken.
    return NextResponse.json({ ok: false, revoked: 0 }, { status: 200 });
  }
}
