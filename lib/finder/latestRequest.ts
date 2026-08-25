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

const COLUMNS =
  'id, level, availability_blocks, lesson_type, budget_max, match_class, near_miss_on, results, child_label, created_at';

export async function getLatestFinderRequest(
  supabase: SupabaseClient,
  userId: string
): Promise<FinderRequestRow | null> {
  const { data, error } = await supabase
    .from('finder_requests')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Most likely cause is migration 240 not being applied. Logged rather than
    // thrown so the caller can show "run the Finder" instead of an error page.
    console.error('[finder] latest request read failed:', error.message);
    return null;
  }

  return (data ?? null) as FinderRequestRow | null;
}
