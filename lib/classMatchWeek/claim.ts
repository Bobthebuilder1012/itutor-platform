/**
 * Claiming an anonymous Class Match Week submission onto an account.
 *
 * The questionnaire completes before any account exists, so the row is keyed
 * on the `cmw_token` cookie with a NULLABLE user_id (docs 02 §2.4). At the
 * first authenticated load of the portal, the token-keyed row is adopted onto
 * the account: user_id and claimed_at are set. If an earlier campaign visit
 * already left a submission carrying this user_id, that older row is
 * un-claimed first so the fresh token row wins — last write wins, and the
 * orphaned row is retained (unclaimed) for reporting.
 *
 * Role rides along: it was asked exactly once, at the portal's landing page,
 * and is never asked again — so if the profile has no role yet, the
 * submission's role becomes the profile's role here. 'parent' is a valid
 * profiles.role on this branch (the parent dashboard exists).
 *
 * This function NEVER throws. A failed claim degrades to an unclaimed
 * submission — the visitor still sees their results; only attribution is
 * lost — so every failure path returns { claimed: false } and warns.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassMatchSubmission } from './types';

export async function claimSubmission(
  admin: SupabaseClient,
  { token, userId }: { token: string; userId: string }
): Promise<{ claimed: boolean; submission: ClassMatchSubmission | null }> {
  try {
    if (!token || !userId) return { claimed: false, submission: null };

    const { data: rowData, error: readError } = await admin
      .from('class_match_submissions')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (readError) {
      console.warn('[class-match] claimSubmission: read failed', readError.message);
      return { claimed: false, submission: null };
    }
    const existing = (rowData as ClassMatchSubmission | null) ?? null;
    if (!existing) return { claimed: false, submission: null };

    // Idempotent fast path: this token row is already this user's. Keep the
    // original claimed_at rather than bumping it on every authed page load.
    if (existing.user_id === userId && existing.claimed_at) {
      await backfillRole(admin, userId, existing.role);
      return { claimed: true, submission: existing };
    }

    // Last write wins: an earlier campaign visit may have left a submission
    // already carrying this user_id. Un-claim it so the fresh token row is
    // the account's single submission. (The old row survives, unclaimed.)
    const { error: clearError } = await admin
      .from('class_match_submissions')
      .update({ user_id: null })
      .eq('user_id', userId)
      .neq('token', token);
    if (clearError) {
      console.warn('[class-match] claimSubmission: un-claim of prior row failed', clearError.message);
      return { claimed: false, submission: existing };
    }

    const { data: updated, error: updateError } = await admin
      .from('class_match_submissions')
      .update({ user_id: userId, claimed_at: new Date().toISOString() })
      .eq('token', token)
      .select('*')
      .single();
    if (updateError || !updated) {
      console.warn(
        '[class-match] claimSubmission: claim update failed',
        updateError?.message ?? 'no row returned'
      );
      return { claimed: false, submission: existing };
    }

    const claimed = updated as ClassMatchSubmission;
    await backfillRole(admin, userId, claimed.role);
    return { claimed: true, submission: claimed };
  } catch (err) {
    console.warn('[class-match] claimSubmission: unexpected failure', err);
    return { claimed: false, submission: null };
  }
}

/**
 * Set profiles.role from the submission when — and only when — the profile
 * has none. An existing role (student, tutor, parent, admin…) always wins;
 * the campaign never overwrites an established account's identity.
 */
async function backfillRole(admin: SupabaseClient, userId: string, role: string): Promise<void> {
  try {
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) {
      console.warn('[class-match] claimSubmission: profile read failed', profileError.message);
      return;
    }
    if (!profile || profile.role != null) return;

    const { error: roleError } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .is('role', null);
    if (roleError) {
      console.warn('[class-match] claimSubmission: role backfill failed', roleError.message);
    }
  } catch (err) {
    console.warn('[class-match] claimSubmission: role backfill threw', err);
  }
}
