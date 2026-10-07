// POST /api/finder/notify-me — "tell me when a class opens".
//
// Flips `demand_signals.notify_optin` on the family's run and stamps
// `notify_requested_at`. The flag is the difference between soft and committed
// demand; the Demand Map ranks on it and its Notify list is built from it.
//
// Accepts a form POST (the results page posts without JavaScript, so the CTA
// works even if the client bundle fails) and redirects back with a marker.
//
// ── WHO CAN OPT IN, AND HOW WE REACH THEM ──────────────────────────────────
//   a session              → the caller's latest run; emailed at profiles.email
//   the finder_token cookie → the run that token names; emailed at the address
//                             typed into the form (`email`), stored on
//                             demand_signals.notify_email
//
// THIS USED TO REFUSE ANONYMOUS OPT-INS and send the visitor to signup with
// `&intent=notify` — a parameter nothing ever read. A family who clicked it and
// made an account was never opted in; one who didn't finish signup left no
// trace at all. Now the intent is recorded on the run THE MOMENT it is clicked,
// with the email if one was given. Without an email the visitor still goes to
// signup, but the opt-in already exists and lib/finder/claim.ts attaches the
// account (and with it the address) when they arrive.
//
// THE POSTED `request_id` IS NOT AN AUTHORISATION INPUT. It arrives from a form
// field; the session or the httpOnly cookie picks the row and it is ignored.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, getServerClient } from '@/lib/supabase/server';
import { track } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import { isFinderEnabled } from '@/lib/featureFlags/finder';
import { readFinderToken } from '@/lib/finder/token';
import { signupThen } from '@/lib/finder/links';
import { ANON_COOKIE } from '@/lib/analytics/attribution';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Same shape the database CHECK enforces (migration 265). */
function cleanEmail(raw: FormDataEntryValue | null): string | null | 'invalid' {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.length > 254 || !EMAIL_RE.test(value)) return 'invalid';
  return value;
}

function isSchemaMismatch(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    msg.includes('could not find') ||
    msg.includes('does not exist')
  );
}

/**
 * Opt the run's ledger row in. Tolerant of an environment without migration
 * 265: the flag itself (migration 240) is what matters, the stamp and address
 * are retried away rather than failing the click.
 */
async function optIn(
  service: ReturnType<typeof getServiceClient>,
  requestId: string,
  email: string | null
): Promise<{ demandId: string | null; error: string | null }> {
  const full: Record<string, unknown> = {
    notify_optin: true,
    notify_requested_at: new Date().toISOString(),
  };
  if (email) full.notify_email = email;

  const run = (payload: Record<string, unknown>) =>
    service
      .from('demand_signals')
      .update(payload)
      .eq('request_id', requestId)
      .select('id')
      .limit(1);

  let { data, error } = await run(full);
  if (error && isSchemaMismatch(error)) {
    console.warn('[finder/notify-me] migration 265 missing; recording the flag only');
    ({ data, error } = await run({ notify_optin: true }));
  }
  if (error) return { demandId: null, error: error.message };
  return { demandId: (data as Array<{ id: string }> | null)?.[0]?.id ?? null, error: null };
}

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

  let form: FormData | null = null;
  try {
    form = await req.formData();
  } catch {
    form = null;
  }
  const email = cleanEmail(form?.get('email') ?? null);

  const service = getServiceClient();
  const back = (marker: string) =>
    NextResponse.redirect(new URL(`/find/results?notify=${marker}`, req.url), 303);

  // ── Signed in: the caller's latest run ──────────────────────────────────
  if (userId) {
    const { data: runRow, error: runError } = await service
      .from('finder_requests')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError || !runRow) {
      console.error('[finder/notify-me] no run to opt in:', runError?.message ?? 'none found');
      return back('failed');
    }

    // The account's address is used; a typed one would only be a second copy.
    const { demandId, error } = await optIn(service, (runRow as { id: string }).id, null);
    if (error) {
      console.error('[finder/notify-me] update failed:', error);
      return back('failed');
    }
    if (demandId) {
      await track(PRODUCT_EVENTS.NOTIFY_ME_CLICKED, { demand_id: demandId }, { userId });
    }
    return back('ok');
  }

  // ── No session: the run the cookie names ────────────────────────────────
  if (email === 'invalid') return back('bad_email');

  const token = await readFinderToken();
  if (!token) return back('failed');

  const { data: runRow, error: runError } = await service
    .from('finder_requests')
    .select('id, role')
    .eq('token', token)
    .maybeSingle();

  if (runError || !runRow) {
    console.error('[finder/notify-me] token names no run:', runError?.message ?? 'none found');
    return back('failed');
  }
  const run = runRow as { id: string; role: string | null };

  const { demandId, error } = await optIn(service, run.id, email);
  if (error) {
    console.error('[finder/notify-me] anonymous update failed:', error);
    return back('failed');
  }

  const anonId = req.cookies.get(ANON_COOKIE)?.value ?? null;
  if (demandId) {
    await track(
      PRODUCT_EVENTS.NOTIFY_ME_CLICKED,
      { demand_id: demandId, anonymous: true, with_email: Boolean(email) },
      { anonId }
    );
  }

  if (email) return back('ok');

  // No address yet: the opt-in is already saved; the account supplies one.
  const role = run.role === 'parent' ? 'parent' : 'student';
  return NextResponse.redirect(
    new URL(signupThen(role, '/find/results?notify=ok'), req.url),
    303
  );
}
