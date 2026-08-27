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
//
// ── THIS ENDPOINT IS NOW ANONYMOUS AND PUBLIC ───────────────────────────────
// It used to 401 without a session. The Finder runs in front of the account now,
// so a run is keyed on a freshly minted httpOnly `finder_token` cookie and
// adopted onto whatever account is created later (lib/finder/claim.ts).
//
// Three consequences that are easy to miss:
//
// 1. IT SEES WHATEVER ARRIVES, not what the form intended to send. Everything
//    goes through validateAnswers, `subject` has a length cap, and `role` and
//    `level` are checked against closed vocabularies — `role` in particular,
//    because the claim copies it into profiles.role.
//
// 2. THE LEVEL COMES FROM THE BODY. It used to be read off profiles.form_level
//    with a comment saying client-supplied levels could not be trusted. Pre-auth
//    there is no profile; the wizard asks the question and sends the answer. An
//    authed run may omit it, and then the profile is still the source.
//
// 3. A FRESH TOKEN PER SUBMISSION. finder_requests is many-rows-per-person
//    (run_number records preference drift) while token is UNIQUE, so reusing one
//    would force re-runs to overwrite the row and throw that drift away.
//
// Abuse guard: `itutor_anon` must be present. Middleware mints it on the first
// PAGE view and skips /api/* entirely (middleware.ts:114-119), so an API route
// can never mint it — which makes its presence proof that a real browser
// rendered a page, and makes a per-anon_id row count a rate limit that needs no
// new table.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, getServerClient } from '@/lib/supabase/server';
import { matchFinderRequest, type FinderCandidate } from '@/lib/matching/finder';
import { loadFinderSupply, type SupplyRow } from '@/lib/finder/supply';
import { budgetMaxFor, validateAnswers } from '@/lib/finder/wizard';
import { mintFinderToken, setFinderToken } from '@/lib/finder/token';
import { ANON_COOKIE } from '@/lib/analytics/attribution';
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
  // NOTE the droppable set is deliberately small. Key material — token, role,
  // claimed_at — must never be listed: dropping a NOT NULL column turns a
  // "column missing" error into a constraint violation, and dropping `token`
  // would produce a run nothing can ever find.

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
  /** The picker's answer. Optional so an authed run can omit it and take the
   *  role from the profile instead. */
  role?: 'student' | 'parent' | null;
  /** Asked by the wizard pre-auth. Optional; the profile is the fallback. */
  level?: CanonicalLevel | null;
  /** The profiles.form_level twin of `level`. Null for CAPE — see
   *  formLevelLabelFor: there is no inverse, and guessing invents a fact. */
  formLevelLabel?: string | null;
}

/** Runs one anon_id may record in an hour before we stop believing it. */
const MAX_RUNS_PER_ANON_PER_HOUR = 10;

export async function POST(req: NextRequest) {
  if (!isFinderEnabled()) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
  }

  // Identity, in order of authority: the session if there is one, otherwise a
  // freshly minted token. Never the body — a caller-supplied user id would let
  // anyone write a run onto someone else's account.
  let userId: string | null = null;
  try {
    const supabase = await getServerClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  // THE ABUSE GUARD, AND WHY IT IS THIS AND NOT A RATE-LIMIT TABLE.
  //
  // itutor_anon is httpOnly and minted by middleware on the first page view.
  // Middleware returns early for every /api/* path WITHOUT applying cookies, so
  // this route cannot mint it — which means its presence proves a real browser
  // rendered a page before posting here. That kills a naive curl loop for free,
  // and cannot lock out a real visitor, because the wizard is only ever reached
  // through a page render.
  const anonId = req.cookies.get(ANON_COOKIE)?.value ?? null;
  if (!userId && !anonId) {
    return NextResponse.json({ error: 'missing_session' }, { status: 400 });
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

  // Per-anon_id ceiling. One indexed read on idx_finder_anon, and it only runs
  // for anonymous callers — a signed-in account is already accountable.
  if (!userId && anonId) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await service
      .from('finder_requests')
      .select('id', { count: 'exact', head: true })
      .eq('anon_id', anonId)
      .gte('created_at', since);
    if (countError) {
      // A missing anon_id column means 247 is not applied. Not a reason to
      // refuse the run — the guard degrades, the feature does not.
      console.warn('[finder/submit] abuse count unavailable:', countError.message);
    } else if ((count ?? 0) >= MAX_RUNS_PER_ANON_PER_HOUR) {
      return NextResponse.json({ error: 'too_many_runs' }, { status: 429 });
    }
  }

  // THE LEVEL COMES FROM THE BODY, WITH THE PROFILE AS FALLBACK.
  //
  // This block used to read the profile and ignore the body entirely, arguing
  // that a client-supplied level could disagree with the account. Pre-auth there
  // is no account to disagree with: the wizard asked the question one screen ago
  // and this is the answer. `app/find/page.tsx` pre-selects the profile's level
  // for an authed run, so the value arriving here is still the account's own.
  //
  // The body value is already validated against LEVEL_VALUES by
  // validateAnswers, so it is a CanonicalLevel and must NOT be run through
  // normaliseLearnerLevel — normalising an already-canonical value is how a bad
  // round trip hides. The normaliser stays where raw `profiles.form_level` is
  // the source: unconstrained text carrying two vocabularies, where an
  // unrecognised value resolves to null and the matcher treats that as "no level
  // constraint" rather than "matches nothing".
  let learnerLevel: CanonicalLevel | null = body.level ?? null;
  if (!learnerLevel && userId) {
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

  // The run's role. The body carries the picker's answer; an authed run without
  // one falls back to the profile. Defaulting to 'student' at the very end is
  // safe because the column is CHECK-constrained to the same two values.
  let runRole: 'student' | 'parent' = body.role === 'parent' ? 'parent' : 'student';
  if (!body.role && userId) {
    const { data: roleRow } = await service
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if ((roleRow as { role?: string | null } | null)?.role === 'parent') runRole = 'parent';
  }

  // A fresh token per run, so one token names exactly one submission. See
  // lib/finder/token.ts on why it is minted here and not in middleware.
  const token = mintFinderToken();

  // run_number: an authed re-run inserts a new row rather than overwriting, so
  // preference drift over time stays queryable. Priors can only be counted when
  // a user is known, so an anonymous run is always 1 — which is why the migration
  // records that run_number is advisory and created_at is authoritative.
  let runNumber = 1;
  if (userId) {
    const { count: priorRuns } = await service
      .from('finder_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    runNumber = (priorRuns ?? 0) + 1;
  }

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
      // Key material and the claim's contract. NOT in insertTolerant's optional
      // list below: that helper silently DROPS unknown columns, and dropping
      // `token` would attempt a NULL insert against a NOT NULL constraint — a
      // stranger failure than the one it exists to prevent. If 247 is missing we
      // want to hear about it.
      token,
      role: runRole,
      anon_id: anonId,
      // An authed run is born already claimed. claimTokenRow's idempotent fast
      // path needs BOTH user_id and claimed_at; writing only user_id would send
      // every authed re-run down the slow path.
      claimed_at: userId ? new Date().toISOString() : null,
      child_label: body.childLabel?.trim() || null,
      run_number: runNumber,
      subject_id: subjectId,
      level: learnerLevel,
      form_level_label: body.formLevelLabel ?? null,
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
    // Name the likely cause. `token`, `role` and `claimed_at` arrive in 247 and
    // are deliberately NOT in insertTolerant's droppable list, so an
    // unapplied 247 fails here rather than silently recording an unreachable
    // run — but only if the log says so, or the next person debugs the wizard
    // instead of the database.
    const looksLikeMissingMigration =
      typeof insertError === 'string' &&
      /token|role|claimed_at|form_level_label|anon_id/i.test(insertError);
    console.error(
      '[finder/submit] insert failed:',
      insertError,
      looksLikeMissingMigration ? '— is migration 247 applied?' : ''
    );
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
    { userId, anonId, attribution }
  );

  await track(
    PRODUCT_EVENTS.MATCH_RETURNED,
    { match_class: matchClass, count: results.length },
    { userId, anonId, attribution }
  );

  await track(
    PRODUCT_EVENTS.DEMAND_RECORDED,
    { subject: body.subject, level: learnerLevel ?? 'unknown' },
    { userId, anonId, attribution }
  );

  // Mark the wizard finished. Written here rather than client-side so a family
  // that closes the tab on the results page still counts as completed.
  //
  // Guarded on userId: an anonymous run has no profile to stamp, and without the
  // guard this ran `.eq('id', null)` — a silent no-op that matched nothing. The
  // stamps for an anonymous run are written by lib/finder/claim.ts at adoption,
  // from the run's created_at, which is also what stops the login backfill
  // re-asking questions the visitor already answered.
  if (userId) {
    const { error: profileError } = await service
      .from('profiles')
      .update({ finder_completed_at: new Date().toISOString() })
      .eq('id', userId);
    if (profileError) {
      console.error('[finder/submit] finder_completed_at update failed:', profileError.message);
    }
  }

  // The cookie goes on LAST, after the row it names exists. Set even for an
  // authed run: the visitor may sign out, and the token is then the only way
  // back to the run they just did.
  await setFinderToken(token);

  return NextResponse.json({
    request_id: requestId,
    demand_id: demandId,
    match_class: matchClass,
    near_miss_on: nearMissOn,
    count: results.length,
  });
}
