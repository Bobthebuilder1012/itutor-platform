// POST /api/finder/submit — record a Finder run, match it, ledger the demand.
//
// Does four things, in this order, and the order matters:
//   1. insert finder_requests (the run is recorded even if matching fails)
//   2. run the matcher against current supply
//   3. update the row with match_class / results / near_miss_on
//   4. insert exactly one demand_signals row — INCLUDING for exact matches,
//      because the ledger is the demand map, not the failure log
//
// The request row is written before matching so that a matcher exception still
// leaves a trace of what the family asked for. Losing the answers is worse than
// losing the recommendation: the answers are the thing teacher acquisition
// cannot reconstruct.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, getServerClient } from '@/lib/supabase/server';
import { matchFinderRequest, type FinderCandidate } from '@/lib/matching/finder';
import { loadFinderSupply, type SupplyRow } from '@/lib/finder/supply';
import { budgetMaxFor, validateAnswers } from '@/lib/finder/wizard';
import { getFinderMaxMatches, isFinderEnabled } from '@/lib/featureFlags/finder';
import { getRequestAttribution, track } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import type { AvailabilityBlock } from '@/lib/matching/availability';
import { normaliseLearnerLevel, type CanonicalLevel } from '@/lib/matching/levels';
import type { DeliveryPref } from '@/lib/matching/delivery';

export const dynamic = 'force-dynamic';

/**
 * Is this error "that column is not in this database" rather than bad data?
 *
 * PGRST204 is PostgREST refusing a write naming a column absent from its schema
 * cache; 42703 is Postgres' own undefined_column.
 */
function isUnknownColumn(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    message.includes('could not find') ||
    message.includes('does not exist')
  );
}

/**
 * Insert a row, dropping columns the database does not have yet.
 *
 * WHY WRITES NEED THIS AND NOT JUST READS. Every READ path for migration 243 was
 * tiered, on the reasoning that a missing column must not blank a page. The
 * INSERTs were not, and that was the whole bug: a missing column fails the
 * ENTIRE insert, so on an environment one migration behind, `delivery_pref`
 * turned every single Finder submission into a 500 and the family got "We could
 * not save your answers" at the last question. That is strictly worse than the
 * blank page the read tiers were protecting against — the wizard's answers are
 * the one thing that cannot be reconstructed.
 *
 * Retries ONCE, without the optional keys, and says so in the log. The dropped
 * answer is recorded nowhere, which is the correct trade: the run itself
 * survives, and the column arrives with the migration.
 */
async function insertTolerant(
  service: ReturnType<typeof getServiceClient>,
  table: string,
  row: Record<string, unknown>,
  optionalColumns: string[]
): Promise<{ id: string | null; error: string | null }> {
  const attempt = async (payload: Record<string, unknown>) =>
    service.from(table).insert(payload).select('id').single();

  const first = await attempt(row);
  if (!first.error) {
    return { id: (first.data as { id: string } | null)?.id ?? null, error: null };
  }

  if (!isUnknownColumn(first.error) || optionalColumns.length === 0) {
    return { id: null, error: first.error.message };
  }

  const trimmed = { ...row };
  for (const column of optionalColumns) delete trimmed[column];

  console.warn(
    `[finder/submit] ${table}: dropping ${optionalColumns.join(', ')} — ` +
      'not in this database yet (migration 243). Retrying without it.'
  );

  const second = await attempt(trimmed);
  if (second.error) return { id: null, error: second.error.message };
  return { id: (second.data as { id: string } | null)?.id ?? null, error: null };
}

interface SubmitBody {
  subject: string;
  availabilityBlocks: AvailabilityBlock[];
  lessonType: 'group' | 'one_on_one' | 'either';
  /** Optional on the wire: a client bundle cached from before migration 243
   *  does not send it, and a stale tab should record null rather than 400. */
  deliveryPref?: DeliveryPref | null;
  budgetBand: string;
  urgency: 'now' | 'this_month' | 'exploring';
  childLabel?: string | null;
}

export async function POST(req: NextRequest) {
  if (!isFinderEnabled()) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
  }

  // /find is auth-gated, so a request always has an account behind it. Identity
  // comes from the session, never the body.
  let userId: string | null = null;
  try {
    const supabase = await getServerClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const invalidField = validateAnswers(raw);
  if (invalidField) {
    return NextResponse.json({ error: 'invalid_field', field: invalidField }, { status: 400 });
  }
  const body = raw as SubmitBody;

  const service = getServiceClient();
  const { attribution } = await getRequestAttribution();

  // THE LEVEL COMES FROM THE PROFILE, NOT THE BODY.
  //
  // It was collected at signup, so asking again reads as though the first answer
  // was discarded — and taking it from the account means the wizard cannot
  // disagree with the profile about what year the learner is in.
  //
  // `profiles.form_level` is unconstrained text carrying two vocabularies, so it
  // goes through normaliseLearnerLevel. An unrecognised value resolves to null,
  // which the matcher treats as "no level constraint" rather than "matches
  // nothing" — the right failure direction here, since a family with an odd
  // form_level should still be shown their subject.
  let learnerLevel: CanonicalLevel | null = null;
  {
    const { data: profileRow, error: profileErr } = await service
      .from('profiles')
      .select('form_level')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr) {
      console.error('[finder/submit] level read failed:', profileErr.message);
    }
    learnerLevel = normaliseLearnerLevel(
      (profileRow as { form_level?: string | null } | null)?.form_level ?? null
    );
  }

  // run_number: a re-run inserts a new row rather than overwriting, so
  // preference drift over time stays queryable.
  const { count: priorRuns } = await service
    .from('finder_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  const runNumber = (priorRuns ?? 0) + 1;

  // Resolve the picked subject name to its canonical row, for the demand map's
  // GROUP BY. A miss is tolerable — the name is what matching uses — so this
  // never fails the request.
  let subjectId: string | null = null;
  try {
    const { data: subjectRow } = await service
      .from('subjects')
      .select('id')
      .ilike('name', body.subject.trim())
      .limit(1)
      .maybeSingle();
    subjectId = (subjectRow as { id: string } | null)?.id ?? null;
  } catch {
    subjectId = null;
  }

  const budgetMax = budgetMaxFor(body.budgetBand);
  const deliveryPref: DeliveryPref | null = body.deliveryPref ?? null;

  // 1) Record the run first. Tolerant of delivery_pref being absent — see
  //    insertTolerant: a missing column fails the whole insert, and losing the
  //    family's answers at the last question is the worst outcome available.
  const { id: requestId, error: insertError } = await insertTolerant(
    service,
    'finder_requests',
    {
      user_id: userId,
      child_label: body.childLabel?.trim() || null,
      run_number: runNumber,
      subject_id: subjectId,
      level: learnerLevel,
      availability_blocks: body.availabilityBlocks,
      lesson_type: body.lessonType,
      delivery_pref: deliveryPref,
      budget_max: budgetMax,
      urgency: body.urgency,
      attribution,
    },
    ['delivery_pref']
  );

  if (insertError || !requestId) {
    console.error('[finder/submit] insert failed:', insertError);
    return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
  }

  // 2) Match. v1 is group classes only; one_on_one and either still record
  // honestly and return no group results, which is a legitimate no-match and
  // exactly how we find out how much one-to-one demand exists.
  let matchClass: 'exact' | 'near' | 'fallback' | 'none' = 'none';
  let nearMissOn: string | null = null;
  let resultRows: SupplyRow[] = [];
  let results: Array<Record<string, unknown>> = [];

  try {
    if (body.lessonType !== 'one_on_one') {
      const supply = await loadFinderSupply(service);
      const bySupplyId = new Map(supply.map(s => [s.groupId, s]));

      const verdict = matchFinderRequest(
        supply as FinderCandidate[],
        {
          subjectNames: [body.subject],
          level: learnerLevel,
          availabilityBlocks: body.availabilityBlocks,
          budgetMax,
          deliveryPref,
        },
        getFinderMaxMatches()
      );

      matchClass = verdict.matchClass;
      nearMissOn = verdict.nearMissOn;

      // Snapshot what was shown. Recomputing later would not give the same
      // answer once the catalogue moves, and then "what did we recommend" is
      // unanswerable.
      results = verdict.matches.map((match, index) => {
        const row = bySupplyId.get(match.groupId);
        if (row) resultRows.push(row);
        return {
          group_id: match.groupId,
          rank: index + 1,
          score: match.score,
          blocks: match.blocks,
          missed: match.missed,
          name: row?.name ?? null,
          tutor_name: row?.tutorName ?? null,
          tutor_verified: row?.tutorVerified ?? false,
          monthly_price: row?.monthlyPrice ?? null,
          class_format: row?.classFormat ?? null,
          region_name: row?.regionName ?? null,
          seats_remaining: row?.seatsRemaining ?? null,
          session_length_minutes: row?.sessionLengthMinutes ?? null,
          schedule_entries: row?.scheduleEntries ?? [],
        };
      });
    }
  } catch (err) {
    // The run is already recorded. Fall through as a no-match rather than
    // failing the request — the family gets the demand-capture path instead of
    // an error page.
    console.error('[finder/submit] matching threw:', err);
  }

  // 3) Attach the verdict.
  const { error: updateError } = await service
    .from('finder_requests')
    .update({
      match_class: matchClass,
      near_miss_on: nearMissOn,
      results,
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('[finder/submit] verdict update failed:', updateError.message);
  }

  // 4) Ledger the demand — every submission, exact matches included.
  const { id: demandId, error: demandError } = await insertTolerant(
    service,
    'demand_signals',
    {
      request_id: requestId,
      user_id: userId,
      subject_id: subjectId,
      level: learnerLevel,
      availability_blocks: body.availabilityBlocks,
      budget_max: budgetMax,
      // Copied onto the ledger, not just the request: "fourteen families in
      // Arima want in-person CSEC Maths" is a recruitment instruction, and
      // "fourteen families want CSEC Maths" is not, because the online and
      // in-person halves of that cluster need different teachers.
      delivery_pref: deliveryPref,
      match_class: matchClass,
    },
    ['delivery_pref']
  );

  if (demandError) {
    console.error('[finder/submit] demand insert failed:', demandError);
  }

  // Events. track() swallows its own failures, so none of this can fail the run.
  await track(
    PRODUCT_EVENTS.FINDER_COMPLETED,
    {
      answers: {
        level: learnerLevel,
        subject: body.subject,
        availability_blocks: body.availabilityBlocks,
        lesson_type: body.lessonType,
        delivery_pref: deliveryPref,
        budget_band: body.budgetBand,
        urgency: body.urgency,
      },
      run_number: runNumber,
    },
    { userId, attribution }
  );

  await track(
    PRODUCT_EVENTS.MATCH_RETURNED,
    { match_class: matchClass, count: results.length },
    { userId, attribution }
  );

  await track(
    PRODUCT_EVENTS.DEMAND_RECORDED,
    { subject: body.subject, level: learnerLevel ?? 'unknown' },
    { userId, attribution }
  );

  // Mark the wizard finished. Written here rather than client-side so a family
  // that closes the tab on the results page still counts as completed.
  const { error: profileError } = await service
    .from('profiles')
    .update({ finder_completed_at: new Date().toISOString() })
    .eq('id', userId);
  if (profileError) {
    console.error('[finder/submit] finder_completed_at update failed:', profileError.message);
  }

  return NextResponse.json({
    request_id: requestId,
    demand_id: demandId,
    match_class: matchClass,
    near_miss_on: nearMissOn,
    count: results.length,
  });
}
