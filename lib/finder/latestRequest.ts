/**
 * The most recent Finder run for a user.
 *
 * Shared by /student/matches, /parent/matches and the /find/results redirect so
 * the three cannot disagree about which run is "current" — the column list in
 * particular, since adding a field to one page and not the others is how a chip
 * quietly stops rendering.
 *
 * Reads with the CALLER'S client, not the service client: RLS on
 * finder_requests is `user_id = auth.uid()`, so the user's own session is both
 * sufficient and the correct authority. Using the service client here would
 * work and would also mean a bug in the user filter leaked another family's
 * search.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinderRequestRow } from '@/components/finder/MatchResults';

const BASE_COLUMNS =
  'id, level, availability_blocks, lesson_type, budget_max, match_class, near_miss_on, results, child_label, created_at';

/**
 * Widest first. `delivery_pref` arrives in migration 243, and a column that is
 * not there yet fails the WHOLE select — which here means every family's saved
 * matches vanish and the page invites them to run a Finder they already ran.
 * That is a worse outcome than one missing chip, so the narrow tier exists.
 */
const SELECT_TIERS = [`${BASE_COLUMNS}, delivery_pref`, BASE_COLUMNS];

/** Distinguishes "the column is not deployed" from a genuine query fault. */
function isSchemaMismatch(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

export async function getLatestFinderRequest(
  supabase: SupabaseClient,
  userId: string
): Promise<FinderRequestRow | null> {
  for (const columns of SELECT_TIERS) {
    const { data, error } = await supabase
      .from('finder_requests')
      .select(columns)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error) {
      const row = (data ?? null) as (FinderRequestRow & { delivery_pref?: string | null }) | null;
      if (!row) return null;
      // Normalised so the component never has to distinguish "the column was not
      // selected" from "the family did not answer". Both mean the same thing to
      // the chip that renders it: do not show one.
      return { ...row, delivery_pref: row.delivery_pref ?? null };
    }

    if (!isSchemaMismatch(error)) {
      // Most likely cause is migration 240 not being applied. Logged rather than
      // thrown so the caller can show "run the Finder" instead of an error page.
      console.error('[finder] latest request read failed:', error.message);
      return null;
    }
  }

  console.error('[finder] every latest-request select tier failed.');
  return null;
}
