// GET /api/finder/gate — should this account be sent to the Finder right now?
//
// WHY THIS EXISTS AS AN ENDPOINT. The login page is a client component, and
// FINDER_GATE_MODE is deliberately NOT `NEXT_PUBLIC_` — the whole point of the
// gate is that a mistake in it reaches the entire existing user base at once
// (build plan §10), so flipping it must not be defeatable by a stale browser
// bundle. The decision therefore has to be taken on the server.
//
// COST. One extra request on login, but only for accounts that have never been
// prompted: the caller already holds `finder_prompted_at` from the profile it
// fetched, and skips this call when it is set. So it is one hop, once, per
// account — exactly the population the one-shot backfill is for.

import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { isFinderEnabled, shouldForceFinder } from '@/lib/featureFlags/finder';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Default to "do not prompt" on every failure path below. A false negative
  // means someone reaches their dashboard and finds the Finder in the nav; a
  // false positive means an interstitial they cannot explain.
  const deny = NextResponse.json({ prompt: false });

  if (!isFinderEnabled()) return deny;

  try {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return deny;

    const { data, error } = await supabase
      .from('profiles')
      .select('role, email, form_level, finder_prompted_at')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      // A missing column fails the whole select, so before migration 238 is
      // applied this denies every request. That is the correct outcome — better
      // no interstitial than one whose one-shot flag cannot be recorded — but it
      // must be visible, or "the backfill never fires" looks like a logic bug
      // rather than an unapplied migration.
      console.error('[finder/gate] profile read failed:', error.message);
      return deny;
    }

    const profile = (data ?? null) as {
      role?: string | null;
      email?: string | null;
      form_level?: string | null;
      finder_prompted_at?: string | null;
    } | null;

    if (!profile) return deny;

    // Only ever once per account.
    if (profile.finder_prompted_at) return deny;

    // Tutors are unaffected, and so is anyone without a learner role.
    if (profile.role !== 'student' && profile.role !== 'parent') return deny;

    // Never stack two interstitials: a student who still owes us a form_level
    // finishes /signup/complete-role first.
    if (profile.role === 'student' && !profile.form_level) return deny;

    // The cohort gate. Defaults to `internal`, so a deploy nobody watched
    // cannot forward-roll this to the whole base by accident.
    if (!shouldForceFinder(profile.email ?? user.email ?? null)) return deny;

    return NextResponse.json({ prompt: true });
  } catch (err) {
    console.error('[finder/gate]', err);
    return deny;
  }
}
