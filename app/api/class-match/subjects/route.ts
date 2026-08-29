import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { subjectsForLevel } from '@/lib/classMatchWeek/subjects';
import { QUESTIONNAIRE_LEVELS, type CanonicalLevel } from '@/lib/classMatchWeek/levels';

export const dynamic = 'force-dynamic';

const LEVEL_VALUES = new Set<string>(QUESTIONNAIRE_LEVELS.map((l) => l.value));

// GET /api/class-match/subjects?level=FORM_4 — the Q2 options for a level.
// Public: the questionnaire runs before any account exists, and RLS returns
// zero rows to anonymous visitors, so this reads through the service client.
export async function GET(req: NextRequest) {
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
    console.error('[GET class-match/subjects]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
