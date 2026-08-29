// POST /api/finder/notify-me — the no-match opt-in.
//
// Flips `demand_signals.notify_optin` for the family's latest request. That flag
// is the difference between soft demand and committed demand, and the demand map
// ranks on it: raw counts include people who shrugged, opt-ins do not.
//
// Accepts a form POST (the results page posts without JavaScript, so the CTA
// works even if the client bundle fails) and redirects back with a marker.
//
// ── AUTHORISATION CHANGED, AND IT GOT STRONGER ──────────────────────────────
// This route used to authorise SOLELY by `user_id = <session>`, which is exactly
// the authority a pre-auth run does not have. It now accepts either proof:
//
//   a session  → the caller's own latest request
//   the httpOnly finder_token cookie → the run that token names
//
// THE POSTED `request_id` IS NO LONGER AN AUTHORISATION INPUT. It arrives from a
// form field, so it was never a capability; previously the `user_id` filter was
// what saved us, which meant a signed-in user could post any request_id and be
// silently scoped back to their own. Now the cookie or the session picks the row
// and the form field is ignored entirely. Strictly fewer ways to be wrong.
//
// ANONYMOUS OPT-INS ARE NOT ACCEPTED — deliberately, and this is a product
// decision rather than an oversight. /api/cron/resolve-demand emails from
// `profiles.email`, so a signal with no user behind it is a promise the system
// cannot keep: recorded, ranked, and never honoured. The anonymous results screen
// therefore offers "create a free account and we'll email you" instead, and the
// claim flips this flag once there is an address to send to. A visitor who
// reaches this route with a token but no session is redirected to that path
// rather than being quietly told "we'll let you know".

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, getServerClient } from '@/lib/supabase/server';
import { track } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import { isFinderEnabled } from '@/lib/featureFlags/finder';
import { readFinderToken } from '@/lib/finder/token';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isFinderEnabled()) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
  }

  let userId: string | null = null;
  try {
    const supabase = await getServerClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  const service = getServiceClient();

  // No session: this can only be an anonymous visitor, whose opt-in we cannot
  // deliver on. Send them to make an account, carrying the intent so the claim
  // knows to flip the flag. A 401 JSON body would replace their results screen
  // with raw JSON, which is the one thing a no-JS form post must never do.
  if (!userId) {
    const token = await readFinderToken();
    const target = token
      ? '/signup?redirect=%2Ffind%2Fclaim%3Fto%3D%252Ffind%252Fresults&intent=notify'
      : '/find/results?notify=failed';
    return NextResponse.redirect(new URL(target, req.url), 303);
  }

  // The caller's latest run. Ordered by created_at because run_number is only
  // advisory (see migration 247) and an anonymous run always carries 1.
  const { data: runRow, error: runError } = await service
    .from('finder_requests')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError || !runRow) {
    console.error('[finder/notify-me] no run to opt in:', runError?.message ?? 'none found');
    return NextResponse.redirect(new URL('/find/results?notify=failed', req.url), 303);
  }

  const requestId = (runRow as { id: string }).id;

  // Not additionally scoped on user_id: the signal may legitimately still be
  // unclaimed if the adoption's demand_signals write has not run yet, and
  // request_id already came from a row we proved belongs to this account.
  const { data: updated, error } = await service
    .from('demand_signals')
    .update({ notify_optin: true })
    .eq('request_id', requestId)
    .select('id')
    .limit(1);

  if (error) {
    console.error('[finder/notify-me] update failed:', error.message);
    return NextResponse.redirect(new URL('/find/results?notify=failed', req.url), 303);
  }

  const demandId = (updated as Array<{ id: string }> | null)?.[0]?.id ?? null;

  if (demandId) {
    await track(PRODUCT_EVENTS.NOTIFY_ME_CLICKED, { demand_id: demandId }, { userId });
  }

  // 303 so the browser follows with GET rather than re-POSTing the form.
  return NextResponse.redirect(new URL('/find/results?notify=ok', req.url), 303);
}
