// GET /api/finder/subjects — the subject options for the signed-in learner.
//
// TAKES NO `?level=`. The level is on the profile (collected at signup), so the
// wizard no longer asks for one and cannot pass one. Reading it here rather than
// accepting it from the client also means the options can never disagree with
// the account — a client-supplied level would let a stale bundle ask for CAPE
// subjects for a Form 2 student.
//
// A Finder-owned twin of /api/class-match/subjects rather than a call into it:
// that route lives in the Class Match Week namespace and imports through the
// lib/classMatchWeek shims, so retiring the campaign would take the Finder's
// subject list with it. Both read the same lib/matching/subjects implementation,
// which is the part that matters.
//
// Reads through the service client: subjectsForLevel unions the curriculum
// vocabulary with live class inventory, and RLS would hide other tutors' classes
// from the requesting student — returning a shorter list with no error.

import { NextResponse } from 'next/server';
import { getServiceClient, getServerClient } from '@/lib/supabase/server';
import { subjectsForLevel } from '@/lib/matching/subjects';
import { normaliseLearnerLevel } from '@/lib/matching/levels';
import { isFinderEnabled } from '@/lib/featureFlags/finder';

export const dynamic = 'force-dynamic';

/**
 * What to offer when the profile carries no usable level.
 *
 * `form_level` is unconstrained text, so an unrecognised value is always
 * possible. Falling back to the CSEC list keeps the wizard usable instead of
 * showing an empty first question — the level only narrows the options, and the
 * matcher treats a null level as "no constraint" anyway, so a wrong-but-present
 * list is recoverable where a blank screen is not.
 */
const FALLBACK_LEVEL = 'FORM_4' as const;

export async function GET() {
  if (!isFinderEnabled()) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
  }

  try {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('form_level')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[finder/subjects] level read failed:', error.message);
    }

    const raw = (data as { form_level?: string | null } | null)?.form_level ?? null;
    const level = normaliseLearnerLevel(raw) ?? FALLBACK_LEVEL;

    const subjects = await subjectsForLevel(getServiceClient(), level);
    return NextResponse.json({ subjects, level });
  } catch (err) {
    console.error('[GET finder/subjects]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
