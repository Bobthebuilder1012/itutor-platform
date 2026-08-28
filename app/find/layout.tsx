/**
 * /find — the Finder's own shell.
 *
 * Auth-required. That is the settled decision (build plan §1): the Finder sits
 * after signup, so every event it emits carries a user_id and no
 * anonymous-to-account stitching is needed. The cost, accepted knowingly, is
 * that demand from people who abandon at signup never reaches the ledger.
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
  if (!isFinderEnabled()) redirect('/student/dashboard');

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Logged-out visitors from a landing CTA land here. Signup, then straight
    // back — the intended path, since the Finder is deliberately behind auth.
    redirect('/signup?redirect=/find');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile as { role?: string } | null)?.role ?? null;
  if (role === 'tutor') redirect('/tutor/dashboard');
  if (role === 'admin') redirect('/admin/dashboard');

  // No wrapper chrome. The wizard and the results screen each render their own
  // full-bleed <main>, because the split-screen layout needs the whole viewport
  // — a centred max-w-2xl container here would have squeezed the illustration
  // panel into a column. This layout exists purely for the auth and role gates.
  return <>{children}</>;
}
