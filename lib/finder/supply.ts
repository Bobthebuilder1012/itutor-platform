/**
 * Loading the classes the Finder is allowed to recommend.
 *
 * Server-only: uses the service client, because RLS returns zero rows for the
 * cross-tutor read this needs and a silent empty result is indistinguishable
 * from "no supply".
 *
 * THE LISTING RULES ARE COPIED FROM /api/groups ON PURPOSE, NOT INVENTED HERE.
 * A class the marketplace hides but the Finder recommends — or the reverse — is
 * the worst kind of bug in this feature: the family is told a class exists,
 * clicks it, and lands on a page that will not let them in. The five rules are:
 *
 *   1. not archived              archived_at IS NULL
 *   2. not private               visibility <> 'private' OR IS NULL
 *   3. not a dev account's       tutor's profiles.is_dev_account IS NOT TRUE
 *   4. has a resolvable schedule resolveScheduleEntries(...) is non-empty
 *   5. published and monthly     status = 'PUBLISHED' AND pricing_model = 'MONTHLY'
 *
 * Rule 3 is the one the build spec got wrong: it puts `is_dev_account` in the
 * groups WHERE clause. The column is on `profiles` (migration 183), so as
 * specified the filter silently does nothing and dev classes leak into results.
 *
 * Rule 5 is deliberately the same pair `subjectsForLevel` uses for its inventory
 * side. If the two disagree, the wizard offers a subject derived from one set of
 * classes and then matches against a different set — so a family picks
 * "Integrated Science" from the list and is told nothing exists.
 *
 * It is NOT `price_per_course IS NOT NULL`, which is what the spec's budget
 * dimension implies: that column is null on every class in staging. The
 * populated field is `price_monthly`, which is also the semantically correct one
 * — the wizard asks for a MONTHLY budget.
 *
 * Rule 4 is the marketplace's own gate and hides 18 of 38 published production
 * classes. That is not a bug to route around — a class with no schedule cannot
 * be attended, and the Finder's whole promise is "here is when it meets".
 * Unlike /api/groups there is no per-row tutor exemption here: a tutor viewing
 * their own unscheduled class in the marketplace is a useful preview, but
 * recommending it to a family is not.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveScheduleEntries,
  type ScheduleEntry,
} from '@/lib/utils/scheduleFormat';
import type { FinderCandidate } from '@/lib/matching/finder';

/** Everything the results page renders, alongside what the matcher scores. */
export interface SupplyRow extends FinderCandidate {
  name: string;
  tutorId: string;
  tutorName: string | null;
  tutorAvatarUrl: string | null;
  sessionLengthMinutes: number | null;
  scheduleEntries: ScheduleEntry[];
}

interface GroupRow {
  id: string;
  name: string | null;
  tutor_id: string;
  subject: string | null;
  form_level: string | null;
  price_per_course: number | string | null;
  price_monthly: number | string | null;
  max_students: number | null;
  visibility: string | null;
  session_length_minutes: number | null;
  schedule_data?: string | null;
  tutor: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    rating_average: number | string | null;
    tutor_verification_status: string | null;
    is_dev_account: boolean | null;
  } | null;
  group_members: Array<{ status: string | null }> | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Same predicate as /api/groups. Environments disagree about which columns
 * exist — `groups.schedule_data` is present in some and absent in staging — and
 * a missing column fails the WHOLE select, so the difference between a tiered
 * read and a plain one is the difference between results and a blank page.
 */
function isSchemaMismatch(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === 'PGRST201' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

const TUTOR_JOIN = `tutor:profiles!groups_tutor_id_fkey(
         id, full_name, avatar_url, rating_average, tutor_verification_status, is_dev_account
       )`;

const BASE_COLUMNS = `id, name, tutor_id, subject, form_level, price_monthly, price_per_course, max_students,
       visibility, session_length_minutes`;

/**
 * Tier 1 includes `schedule_data` (a tutor's hand-authored schedule, which wins
 * over the derived pattern in /api/groups). Tier 2 drops it, for environments
 * where the column was never added — the resolver then falls through to the
 * group_sessions recurrence, which is where almost every real schedule lives
 * anyway.
 */
const SELECT_TIERS = [
  `${BASE_COLUMNS}, schedule_data, ${TUTOR_JOIN}, group_members(status)`,
  `${BASE_COLUMNS}, ${TUTOR_JOIN}, group_members(status)`,
];

/**
 * Seats left, or null when the class has no stated capacity.
 *
 * Null means unknown, and the matcher treats unknown as "not full" — excluding
 * it would hide every class whose tutor never set a limit, which is most of
 * them.
 */
function seatsRemaining(row: GroupRow): number | null {
  if (row.max_students === null || row.max_students === undefined) return null;
  const approved = (row.group_members ?? []).filter(m => m.status === 'approved').length;
  return row.max_students - approved;
}

/**
 * Load every class the Finder may recommend.
 *
 * Deliberately loads the whole eligible set and filters in memory rather than
 * pushing subject and level into the query. Both are free text on `groups`
 * (`subject` has no FK, `form_level` carries two vocabularies) so the matching
 * has to run through the normalisation layer in lib/matching — a SQL `ilike`
 * would match "Mathematics" against "CSEC Additional Mathematics" but miss
 * "add maths", which is what a parent actually types. The catalogue is ~40
 * classes; this is a small read, and correctness beats a pushdown here.
 */
export async function loadFinderSupply(service: SupabaseClient): Promise<SupplyRow[]> {
  let rows: GroupRow[] | null = null;

  for (const select of SELECT_TIERS) {
    const { data, error } = await service
      .from('groups')
      .select(select)
      .is('archived_at', null)
      .eq('status', 'PUBLISHED')
      .eq('pricing_model', 'MONTHLY');

    if (!error) {
      rows = (data ?? []) as unknown as GroupRow[];
      break;
    }
    if (!isSchemaMismatch(error)) {
      console.error('[finder/supply] group load failed:', error.message);
      return [];
    }
    // Otherwise fall through to the next, narrower tier.
  }

  if (rows === null) {
    console.error('[finder/supply] every select tier failed — returning no supply.');
    return [];
  }

  // Rules 2 and 3, in memory: `visibility` is nullable so an .or() has to spell
  // out the null case, and is_dev_account lives on the joined profile where a
  // top-level filter cannot reach it.
  const visible = rows.filter(row => {
    if (row.visibility === 'private') return false;
    if (row.tutor?.is_dev_account === true) return false;
    return true;
  });

  if (visible.length === 0) return [];

  // Resolve each class's weekly pattern through the SAME three-tier resolver
  // /api/groups renders from: manual schedule_data, then the group_sessions
  // recurrence rule, then dated occurrences.
  const groupIds = visible.map(r => r.id);
  const { data: sessionRows, error: sessionError } = await service
    .from('group_sessions')
    .select(
      'group_id, start_time, recurrence_type, recurrence_days, duration_minutes, ' +
        'group_session_occurrences(scheduled_start_at, scheduled_end_at, cancelled_at, status)'
    )
    .in('group_id', groupIds)
    .order('created_at', { ascending: true });

  if (sessionError) {
    console.warn('[finder/supply] schedule load failed (non-fatal):', sessionError.message);
  }

  const rulesByGroup = new Map<string, any[]>();
  const occurrencesByGroup = new Map<string, any[]>();
  for (const row of sessionRows ?? []) {
    const key = String((row as any).group_id);
    rulesByGroup.set(key, [...(rulesByGroup.get(key) ?? []), row]);
    occurrencesByGroup.set(key, [
      ...(occurrencesByGroup.get(key) ?? []),
      ...(((row as any).group_session_occurrences as any[]) ?? []),
    ]);
  }

  const out: SupplyRow[] = [];

  for (const row of visible) {
    const entries = resolveScheduleEntries({
      scheduleData: row.schedule_data ?? null,
      sessionRows: rulesByGroup.get(row.id) ?? [],
      occurrences: occurrencesByGroup.get(row.id) ?? [],
    });

    // Rule 4. No schedule, no recommendation.
    if (entries.length === 0) continue;

    out.push({
      groupId: row.id,
      name: row.name ?? 'Untitled class',
      tutorId: row.tutor_id,
      tutorName: row.tutor?.full_name ?? null,
      tutorAvatarUrl: row.tutor?.avatar_url ?? null,
      subject: row.subject,
      formLevel: row.form_level,
      monthlyPrice: toNumber(row.price_monthly) ?? toNumber(row.price_per_course),
      scheduleEntries: entries,
      seatsRemaining: seatsRemaining(row),
      // Verification ranks and badges; it is NOT a hard filter. Gating on it
      // cuts the catalogue to 2 classes.
      tutorVerified: row.tutor?.tutor_verification_status === 'verified',
      rating: toNumber(row.tutor?.rating_average),
      sessionLengthMinutes: row.session_length_minutes,
    });
  }

  return out;
}
