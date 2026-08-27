/**
 * Adopting an anonymous, token-keyed row onto an account.
 *
 * Any flow that collects answers BEFORE an account exists has the same problem:
 * the row has to be keyed on something that exists at write time. Both callers
 * key on a random token held in a first-party cookie, with a NULLABLE user_id,
 * and adopt the row onto the account at the first authenticated load.
 *
 * WHY THE UNIQUE KEY IS THE TOKEN AND NOT user_id. A `UNIQUE(user_id)` would
 * THROW at the moment of sign-in, whenever a token row is adopted onto an
 * account that already carries one — which is the ordinary case for anyone who
 * comes back a second time. So the token is unique, user_id is nullable, and
 * this function resolves the collision explicitly: last write wins. Any older
 * row for the same user is un-claimed first, and survives (unclaimed) for
 * reporting rather than being deleted.
 *
 * Role rides along. It was asked exactly once, before signup, and is never
 * asked again — so if the profile has no role yet, the row's role becomes the
 * profile's role here. An EXISTING role always wins; adoption never overwrites
 * an established account's identity.
 *
 * THIS FUNCTION NEVER THROWS. A failed claim degrades to an unclaimed row: the
 * visitor still sees their results, and only attribution is lost. Every failure
 * path returns `{ claimed: false }` and warns.
 *
 * `unclaimPrior` (default true) controls the collision step, and getting it
 * wrong is silent data loss rather than an error. See the comment at that step:
 * it is correct only for one-row-per-person tables. The second caller,
 * `finder_requests`, is many-rows-per-person and passes false.
 *
 * WHAT THIS FUNCTION DOES NOT DO. It touches the token row and profiles.role,
 * and nothing else. Any table that hangs off the claimed row — for the Finder,
 * `demand_signals.user_id` — is the caller's responsibility, because only the
 * caller knows what those are. lib/finder/claim.ts documents its three.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The columns adoption actually touches. Callers pass their own richer row type
 * as `T`; this bound is what the algorithm needs and nothing more, which is why
 * this module has no dependency on any individual feature's types.
 */
export type ClaimableTokenRow = {
  token: string;
  user_id: string | null;
  role: string;
  claimed_at: string | null;
};

export async function claimTokenRow<T extends ClaimableTokenRow>(
  admin: SupabaseClient,
  {
    table,
    token,
    userId,
    unclaimPrior = true,
  }: { table: string; token: string; userId: string; unclaimPrior?: boolean }
): Promise<{ claimed: boolean; row: T | null }> {
  try {
    if (!table || !token || !userId) return { claimed: false, row: null };

    const { data: rowData, error: readError } = await admin
      .from(table)
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (readError) {
      console.warn(`[matching] claimTokenRow(${table}): read failed`, readError.message);
      return { claimed: false, row: null };
    }
    const existing = (rowData as T | null) ?? null;
    if (!existing) return { claimed: false, row: null };

    // Idempotent fast path: this token row is already this user's. Keep the
    // original claimed_at rather than bumping it on every authed page load.
    if (existing.user_id === userId && existing.claimed_at) {
      await backfillRole(admin, userId, existing.role);
      return { claimed: true, row: existing };
    }

    // Last write wins: an earlier visit may have left a row already carrying
    // this user_id. Un-claim it so the fresh token row is the account's single
    // row. (The old row survives, unclaimed, and is still counted in reporting
    // as an orphan rather than vanishing.)
    //
    // ONLY FOR TABLES THAT ARE ONE-ROW-PER-PERSON. This step exists solely to
    // dodge a UNIQUE(user_id), which would THROW when a token row is adopted
    // onto an account that already carries one. A table that is deliberately
    // MANY-rows-per-person has no such constraint, and running this against one
    // is pure data loss: it strips user_id from every prior row the account
    // owns. `finder_requests` is exactly that table — its `run_number` exists to
    // record preference drift across runs — so lib/finder/claim.ts passes
    // `unclaimPrior: false`. The default is true so the original caller
    // (class_match_submissions, which does have UNIQUE(user_id)) is unchanged.
    if (unclaimPrior) {
      const { error: clearError } = await admin
        .from(table)
        .update({ user_id: null })
        .eq('user_id', userId)
        .neq('token', token);
      if (clearError) {
        console.warn(
          `[matching] claimTokenRow(${table}): un-claim of prior row failed`,
          clearError.message
        );
        return { claimed: false, row: existing };
      }
    }

    const { data: updated, error: updateError } = await admin
      .from(table)
      .update({ user_id: userId, claimed_at: new Date().toISOString() })
      .eq('token', token)
      .select('*')
      .single();
    if (updateError || !updated) {
      console.warn(
        `[matching] claimTokenRow(${table}): claim update failed`,
        updateError?.message ?? 'no row returned'
      );
      return { claimed: false, row: existing };
    }

    const claimed = updated as T;
    await backfillRole(admin, userId, claimed.role);
    return { claimed: true, row: claimed };
  } catch (err) {
    console.warn(`[matching] claimTokenRow(${table}): unexpected failure`, err);
    return { claimed: false, row: null };
  }
}

/**
 * Set profiles.role from the adopted row when — and only when — the profile has
 * none. An existing role (student, tutor, parent, admin…) always wins.
 *
 * The `.is('role', null)` on the UPDATE is not redundant with the read above it:
 * it closes the race where two tabs adopt at once.
 */
async function backfillRole(admin: SupabaseClient, userId: string, role: string): Promise<void> {
  try {
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) {
      console.warn('[matching] claimTokenRow: profile read failed', profileError.message);
      return;
    }
    if (!profile || profile.role != null) return;

    const { error: roleError } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .is('role', null);
    if (roleError) {
      console.warn('[matching] claimTokenRow: role backfill failed', roleError.message);
    }
  } catch (err) {
    console.warn('[matching] claimTokenRow: role backfill threw', err);
  }
}
