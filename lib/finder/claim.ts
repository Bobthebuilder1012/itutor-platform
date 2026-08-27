/**
 * Adopting an anonymous Finder run onto the account that just signed in.
 *
 * The algorithm itself lives in `lib/matching/claim.ts` and is shared with Class
 * Match Week. This file is the `finder_requests` binding plus the three writes
 * the shared algorithm deliberately does not do, because only this feature knows
 * what hangs off its row.
 *
 * ── unclaimPrior: false ─────────────────────────────────────────────────────
 * The one parameter that matters. `claimTokenRow`'s collision step un-claims any
 * other row already carrying this user_id, which exists solely to dodge CMW's
 * `UNIQUE(user_id)`. `finder_requests` has no such constraint and is
 * deliberately many-rows-per-person — `run_number` is there to record
 * preference drift. Running that step here would strip `user_id` from EVERY
 * prior run belonging to anyone who answers the questionnaire anonymously while
 * already having an account: cleared cookies, logged out, a second phone. It
 * would also break `getLatestFinderRequest` for those rows, so the family's
 * saved matches would vanish. Passing false is not an optimisation.
 *
 * ── THE THREE WRITES claimTokenRow DOES NOT DO ──────────────────────────────
 * All three fail silently if forgotten, which is why they are here rather than
 * at the call sites:
 *
 *   1. demand_signals.user_id — the ledger row stays anonymous otherwise, and
 *      /api/cron/resolve-demand checks `signal.user_id` before emailing. Forget
 *      this and every family who signs up after answering is silently never
 *      told when their class opens. That is the promise the button made.
 *
 *   2. profiles.form_level — from `form_level_label`, and only when the profile
 *      has none. Without it a visitor who abandons signup's profile step has an
 *      account with no year level, and every later Finder run reads it off the
 *      profile and finds nothing.
 *
 *   3. profiles.finder_prompted_at / finder_completed_at — from the run's
 *      created_at. `finder_prompted_at` is otherwise stamped only by a `/find`
 *      PAGE render, which pre-auth happens before the account exists. Forget
 *      this and the one-shot login backfill force-feeds the wizard, a week
 *      later, to someone who already answered every question.
 *
 * Every write here is conditional on the target being null. An established
 * account's role, level and prompt history always win — adoption fills gaps, it
 * never overwrites.
 *
 * NEVER THROWS, like the algorithm it wraps. A failed claim leaves an unclaimed
 * row: the visitor keeps their matches and only the link to the account is lost.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { claimTokenRow, type ClaimableTokenRow } from '@/lib/matching/claim';

export interface FinderRunRow extends ClaimableTokenRow {
  id: string;
  created_at: string;
  form_level_label: string | null;
}

export interface ClaimFinderResult {
  claimed: boolean;
  row: FinderRunRow | null;
}

export async function claimFinderRun(
  admin: SupabaseClient,
  { token, userId }: { token: string; userId: string }
): Promise<ClaimFinderResult> {
  const { claimed, row } = await claimTokenRow<FinderRunRow>(admin, {
    table: 'finder_requests',
    token,
    userId,
    // See the header. This is the whole reason this wrapper exists.
    unclaimPrior: false,
  });

  if (!claimed || !row) return { claimed, row };

  await attachDemandSignals(admin, row.id, userId);
  await backfillProfileFromRun(admin, userId, row);

  return { claimed, row };
}

/**
 * Point the run's ledger row at the account.
 *
 * Scoped `WHERE user_id IS NULL` so a re-claim cannot move a signal that some
 * other account already owns — which would silently reassign one family's
 * recorded demand to another.
 */
async function attachDemandSignals(
  admin: SupabaseClient,
  requestId: string,
  userId: string
): Promise<void> {
  try {
    const { error } = await admin
      .from('demand_signals')
      .update({ user_id: userId })
      .eq('request_id', requestId)
      .is('user_id', null);
    if (error) {
      console.warn('[finder/claim] demand_signals attach failed:', error.message);
    }
  } catch (err) {
    console.warn('[finder/claim] demand_signals attach threw:', err);
  }
}

/**
 * Fill the profile's gaps from the run.
 *
 * Read-then-write with the null test repeated in the UPDATE's WHERE clause. The
 * repetition is not redundant: it closes the race where two tabs claim at once,
 * the same pattern `backfillRole` in lib/matching/claim.ts already uses.
 */
async function backfillProfileFromRun(
  admin: SupabaseClient,
  userId: string,
  row: FinderRunRow
): Promise<void> {
  try {
    const { data, error } = await admin
      .from('profiles')
      .select('form_level, finder_prompted_at, finder_completed_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      // Most likely migration 238 is not applied on this environment. Logged
      // rather than thrown — the claim itself already succeeded.
      console.warn('[finder/claim] profile read failed:', error.message);
      return;
    }

    const profile = (data ?? null) as {
      form_level?: string | null;
      finder_prompted_at?: string | null;
      finder_completed_at?: string | null;
    } | null;
    if (!profile) return;

    // 2. The year level, in the profile's own vocabulary.
    if (!profile.form_level && row.form_level_label) {
      const { error: levelError } = await admin
        .from('profiles')
        .update({ form_level: row.form_level_label })
        .eq('id', userId)
        .is('form_level', null);
      if (levelError) {
        console.warn('[finder/claim] form_level backfill failed:', levelError.message);
      }
    }

    // 3. Prompt history, so the login backfill does not re-ask.
    const stamps: Record<string, string> = {};
    if (!profile.finder_prompted_at) stamps.finder_prompted_at = row.created_at;
    if (!profile.finder_completed_at) stamps.finder_completed_at = row.created_at;

    if (Object.keys(stamps).length > 0) {
      const { error: stampError } = await admin
        .from('profiles')
        .update(stamps)
        .eq('id', userId);
      if (stampError) {
        console.warn('[finder/claim] prompt stamps failed:', stampError.message);
      }
    }
  } catch (err) {
    console.warn('[finder/claim] profile backfill threw:', err);
  }
}
