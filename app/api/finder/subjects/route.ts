// GET /api/finder/subjects?level=FORM_4 — the subject options for one level.
//
// TAKES `?level=` NOW, AND NO LONGER REQUIRES A SESSION. This route used to
// refuse anonymous callers and read the level off `profiles.form_level`, on the
// reasoning that "the options can never disagree with the account — a
// client-supplied level would let a stale bundle ask for CAPE subjects for a
// Form 2 student". That was right while the Finder sat behind auth. It now runs
// in front of it, where there is no profile to read and the level is an answer
// the visitor gave one screen ago. Ignoring that answer in favour of an account
// fact would make the question a lie.
//
// The old protection is kept where it still applies: when a session DOES exist,
// app/find/page.tsx pre-selects the level from the profile, so an authed run
// sends back the account's own value rather than inventing one.
//
// SAFE TO SERVE PUBLICLY. The response is a list of subject names — curriculum
// vocabulary unioned with the subjects of published classes. No PII, nothing
// per-user, and nothing a visitor could not read off the marketplace. Cached at
// the edge for five minutes because the answer depends only on `level`.
//
// A Finder-owned twin of /api/class-match/subjects rather than a call into it:
// that route lives in the Class Match Week namespace and imports through the
// lib/classMatchWeek shims, so retiring the campaign would take the Finder's
// subject list with it. Both read the same lib/matching/subjects implementation,
// which is the part that matters.
//
// Reads through the service client: subjectsForLevel unions the curriculum
// vocabulary with live class inventory, and RLS would hide other tutors' classes
// from the requesting student — returning a shorter list with no error. For an
// anonymous caller RLS would return nothing at all.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { subjectsForLevel } from '@/lib/matching/subjects';
import type { CanonicalLevel } from '@/lib/matching/levels';
import { LEVEL_VALUES } from '@/lib/finder/wizard';
import { isFinderEnabled } from '@/lib/featureFlags/finder';

export const dynamic = 'force-dynamic';

/**
 * What to offer when no usable level arrives.
 *
 * Falling back to the CSEC list keeps the wizard usable instead of showing an
 * empty first question. The level only narrows the options, and the matcher
 * treats a null level as "no constraint" anyway, so a wrong-but-present list is
 * recoverable where a blank screen is not.
 *
 * Note this is a fallback, not a rejection: a 400 here would mean a stale client
 * bundle turns the subject question into a dead end.
 */
const FALLBACK_LEVEL: CanonicalLevel = 'FORM_4';

export async function GET(request: NextRequest) {
  if (!isFinderEnabled()) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
  }

  try {
    // Validated against the closed vocabulary rather than cast. The value is
    // passed to subjectsForLevel, which branches on it — an unrecognised string
    // would fall through to the CSEC branch and quietly serve the wrong list.
    const raw = request.nextUrl.searchParams.get('level');
    const level: CanonicalLevel =
      raw && LEVEL_VALUES.has(raw) ? (raw as CanonicalLevel) : FALLBACK_LEVEL;

    const subjects = await subjectsForLevel(getServiceClient(), level);

    return NextResponse.json(
      { subjects, level },
      {
        headers: {
          // Depends only on `level`, and the catalogue moves slowly. Five
          // minutes takes the subject question off the database on the busiest
          // screen in the flow.
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (err) {
    console.error('[GET finder/subjects]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
