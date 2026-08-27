// GET /find/claim?to=/somewhere — adopt the anonymous run, then continue.
//
// The single hop every post-signup and post-login redirect in this flow points
// at. A visitor answers the questionnaire with no account, clicks through to a
// class, signs in or signs up, and arrives here: the run is adopted onto the
// new account and they are forwarded to where they were actually going.
//
// WHY A ROUTE AND NOT A HOOK ON EACH DESTINATION. The destinations are a class
// page (a client component), the marketplace, and the matches screen — three
// unrelated files that would each need to grow a Finder concern, and any one of
// them missing it means a family silently loses their answers. One route, one
// place to be right.
//
// It is deliberately thin. The adoption itself is idempotent and never throws
// (lib/finder/claim.ts), and the belt-and-braces claims on /student/matches and
// /parent/matches catch anyone who reaches an account by a path that skipped
// this. Being called twice costs one indexed read.
//
// `?to=` is validated through safeRedirectPath — it arrives from a query string,
// so an unvalidated forward here would be an open redirect wearing a helpful
// hat.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { adoptFinderRunFromCookie } from '@/lib/finder/adoptFromCookie';
import { safeRedirectPath } from '@/lib/utils/safeRedirect';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const to = safeRedirectPath(request.nextUrl.searchParams.get('to'));

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Reached without a session: the sign-in did not complete, or someone opened
    // the URL directly. Send them to log in and come straight back, so the
    // adoption still happens rather than being silently skipped.
    const back = `/find/claim${to ? `?to=${encodeURIComponent(to)}` : ''}`;
    return NextResponse.redirect(
      new URL(`/login?redirect=${encodeURIComponent(back)}`, request.url)
    );
  }

  await adoptFinderRunFromCookie(user.id);

  // Default destination is the account's permanent matches home rather than a
  // dashboard: the visitor's last screen was their matches, and returning them
  // anywhere else reads as having lost them.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile as { role?: string | null } | null)?.role ?? null;
  const fallback = role === 'parent' ? '/parent/matches' : '/student/matches';

  return NextResponse.redirect(new URL(to ?? fallback, request.url));
}
