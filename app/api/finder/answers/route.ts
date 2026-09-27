// GET /api/finder/answers — the answers behind this browser's latest run.
//
// EXISTS TO FIX A LIVE BUG, not only to serve the pre-auth flow. `MatchResults`
// renders each answer as a `FilterChip` linking to `/find?step=N`, which is the
// intended way to widen a search. But `FinderWizard` seeded its state from
// `emptyAnswers()`, so following one of those links let the visitor change their
// budget and then submitted `subject: null` — `validateAnswers` returned
// 'subject', the route 400'd, and the screen said "We could not save your
// answers". That is broken today for signed-in users, and the anonymous flow
// makes editing a filter the primary path, so it would have become the main
// failure mode of the new experience.
//
// Identity, in order: the session's latest run if there is one, otherwise the
// run named by the httpOnly `finder_token` cookie. Never an id from the query
// string — that would let anyone read any family's answers by guessing.
//
// Returns ONLY the answer fields. Not the results snapshot, not the request id,
// not the attribution: the wizard needs to repopulate a form and nothing more,
// and a route that hands back everything invites a caller to depend on it.

import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { readFinderToken } from '@/lib/finder/token';
import { isFinderEnabled } from '@/lib/featureFlags/finder';
import type { AvailabilityBlock } from '@/lib/matching/availability';
import type { CanonicalLevel } from '@/lib/matching/levels';
import type { DeliveryPref } from '@/lib/matching/delivery';
import { BUDGET_BANDS } from '@/lib/finder/wizard';

export const dynamic = 'force-dynamic';

const COLUMNS =
  'level, availability_blocks, lesson_type, delivery_pref, budget_max, urgency, child_label';

interface RunRow {
  level: string | null;
  availability_blocks: string[] | null;
  lesson_type: string | null;
  delivery_pref?: string | null;
  budget_max: number | string | null;
  urgency: string | null;
  child_label: string | null;
}

/** Two tiers: delivery_pref arrives in 243, which may not be applied. */
const SELECT_TIERS = [COLUMNS, COLUMNS.replace(', delivery_pref', '')];

function isSchemaMismatch(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

/**
 * The budget is stored as a ceiling in TTD; the wizard's radio group is keyed on
 * the BAND. Mapped back rather than stored twice, so the two cannot disagree —
 * and `null` legitimately means the no-limit band, which is why the find is on
 * `max` rather than on truthiness.
 */
function bandForMax(max: number | string | null): string | null {
  const n = max === null || max === undefined ? null : Number(max);
  const band = BUDGET_BANDS.find(b => b.max === (Number.isFinite(n as number) ? n : null));
  return band?.value ?? null;
}

export async function GET() {
  if (!isFinderEnabled()) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
  }

  try {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const token = await readFinderToken();
    if (!user && !token) {
      // Not an error. A first visit has no stored run, and the wizard treats a
      // null body as "nothing to restore".
      return NextResponse.json({ answers: null });
    }

    // Service client because an anonymous caller has no RLS identity at all, and
    // the authenticated policy is scoped to user_id — which is exactly the
    // column that is null for the run we are trying to read.
    const service = getServiceClient();

    for (const columns of SELECT_TIERS) {
      let query = service.from('finder_requests').select(columns);
      // A session wins over the cookie: someone who signed in mid-flow should
      // get their account's latest run, not whatever a stale cookie points at.
      query = user ? query.eq('user_id', user.id) : query.eq('token', token as string);

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        if (isSchemaMismatch(error)) continue;
        console.error('[finder/answers] read failed:', error.message);
        return NextResponse.json({ answers: null });
      }

      const row = (data ?? null) as unknown as RunRow | null;
      if (!row) return NextResponse.json({ answers: null });

      return NextResponse.json({
        answers: {
          level: (row.level as CanonicalLevel | null) ?? null,
          availabilityBlocks: (row.availability_blocks ?? []) as AvailabilityBlock[],
          lessonType: row.lesson_type,
          deliveryPref: (row.delivery_pref as DeliveryPref | null) ?? null,
          budgetBand: bandForMax(row.budget_max),
          urgency: row.urgency,
          childLabel: row.child_label,
        },
      });
    }

    return NextResponse.json({ answers: null });
  } catch (err) {
    console.error('[GET finder/answers]', err);
    return NextResponse.json({ answers: null });
  }
}
