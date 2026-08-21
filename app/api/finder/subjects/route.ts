// GET /api/finder/subjects?level=FORM_4 — the subject options for step 2.
//
// A Finder-owned twin of /api/class-match/subjects. Deliberately NOT a call into
// the campaign route: that one lives under the Class Match Week namespace and
// imports through lib/classMatchWeek's shims, so the campaign being retired (or
// its kill switch moving) would take the Finder's subject list with it. Both
// read the same lib/matching/subjects implementation, which is the part that
// actually matters.
//
// Reads through the service client: `subjectsForLevel` unions the curriculum
// vocabulary with live class inventory, and RLS would hide other tutors' classes
// from the requesting student — returning a shorter list with no error.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { subjectsForLevel } from '@/lib/matching/subjects';
import type { CanonicalLevel } from '@/lib/matching/levels';
import { LEVEL_VALUES } from '@/lib/finder/wizard';
import { isFinderEnabled } from '@/lib/featureFlags/finder';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isFinderEnabled()) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
  }

  try {
    const level = new URL(req.url).searchParams.get('level');

    // The canonical vocabulary is closed — anything else is junk, not a new
    // level we should quietly serve an empty list for.
    if (!level || !LEVEL_VALUES.has(level)) {
      return NextResponse.json({ error: 'invalid_field', field: 'level' }, { status: 400 });
    }

    const subjects = await subjectsForLevel(getServiceClient(), level as CanonicalLevel);
    return NextResponse.json({ subjects });
  } catch (err) {
    console.error('[GET finder/subjects]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
