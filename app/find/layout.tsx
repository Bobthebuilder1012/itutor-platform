/**
 * /find — the Finder's own shell.
 *
 * NO LONGER AUTH-REQUIRED. This block used to say the opposite — "the Finder
 * sits after signup, so every event carries a user_id and no
 * anonymous-to-account stitching is needed" — and that was the settled decision
 * until the owner reversed it. Account creation must not stand in front of the
 * value, so the questionnaire runs first and the run is adopted onto whatever
 * account is created afterwards (migration 247, lib/finder/claim.ts).
 *
 * The accepted cost has inverted too. It used to be "demand from people who
 * abandon at signup never reaches the ledger". Now that demand DOES reach the
 * ledger, and the cost is an unauthenticated write endpoint — guarded by
 * requiring the httpOnly itutor_anon cookie, which only a real page render can
 * mint.
 *
 * Focused chrome — no sidebar. During the forced first run the wizard is the
 * only thing on screen, because a nav rail beside a five-question interstitial
 * invites the family to leave before they have told us anything.
 *
 * TUTORS ARE SENT AWAY. The Finder is for people looking for classes. A tutor
 * who lands here (a shared link, a stale bookmark) goes to their own dashboard
 * rather than being asked what they want to study.
 */

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { isFinderEnabled } from '@/lib/featureFlags/finder';

export const dynamic = 'force-dynamic';

export default async function FindLayout({ children }: { children: ReactNode }) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Flag off sends an ANONYMOUS visitor to the marketing site, not to
  // /student/dashboard — that is an authenticated page, so the old branch turned
  // "the feature is off" into "log in first" for someone who arrived from a
  // landing CTA and has no account at all.
  if (!isFinderEnabled()) redirect(user ? '/student/dashboard' : '/');

  // NO AUTH GATE. A logged-out visitor is the primary audience now.
  // The tutor/admin ejects below still apply, but only to someone signed in —
  // there is no role to read without a session.
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const role = (profile as { role?: string } | null)?.role ?? null;
    if (role === 'tutor') redirect('/tutor/dashboard');
    if (role === 'admin') redirect('/admin/dashboard');
  }

  // No wrapper chrome. The wizard and the results screen each render their own
  // full-bleed <main>, because the split-screen layout needs the whole viewport
  // — a centred max-w-2xl container here would have squeezed the illustration
  // panel into a column. This layout exists purely for the auth and role gates.
  return <>{children}</>;
}
