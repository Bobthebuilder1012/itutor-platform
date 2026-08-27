// POST /api/finder/notify-me — the no-match opt-in.
//
// Flips `demand_signals.notify_optin` for the family's latest request. That flag
// is the difference between soft demand and committed demand, and the demand map
// ranks on it: raw counts include people who shrugged, opt-ins do not.
//
// Accepts a form POST (the results page posts without JavaScript, so the CTA
// works even if the client bundle fails) and redirects back with a marker.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, getServerClient } from '@/lib/supabase/server';
import { track } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import { isFinderEnabled } from '@/lib/featureFlags/finder';

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
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // request_id arrives from a form field, so it is untrusted. It is only ever
  // used alongside `user_id = userId`, which is what stops one family opting
  // another family's request in.
  let requestId: string | null = null;
  try {
    const form = await req.formData();
    const raw = form.get('request_id');
    requestId = typeof raw === 'string' && raw.length > 0 ? raw : null;
  } catch {
    requestId = null;
  }

  const service = getServiceClient();

  let query = service
    .from('demand_signals')
    .update({ notify_optin: true })
    .eq('user_id', userId);

  query = requestId ? query.eq('request_id', requestId) : query;

  const { data: updated, error } = await query.select('id').limit(1);

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
