// =====================================================
// PROFILE SYNC
// =====================================================
// Reads the current profile from the database and ships it. Callers never pass
// attributes: the row is always re-read, so a sync triggered by a stale event
// still delivers the latest truth and two racing syncs converge instead of
// fighting.
//
// Server-only.

import { getServiceClient } from '@/lib/supabase/server';
import { getCustomerIoConfig, isProfileSyncable } from './config';
import { identify, deleteCustomer, REQUEST_PATH_CALL, type CallOptions } from './client';
import {
  buildCustomerAttributes,
  hashAttributes,
  PROFILE_SYNC_COLUMNS,
  subjectNamesFrom,
  type SyncableProfile,
} from './attributes';

/**
 * A tutor's subject names, from the tutor_subjects join table.
 *
 * Only called for tutors, so this costs nothing on the student and parent rows
 * that make up most of the table. Returns null on failure rather than throwing:
 * a profile synced without its subject list is far better than one not synced
 * at all, and the next run will pick the subjects up.
 */
async function fetchTutorSubjects(
  service: AnyClient,
  tutorId: string
): Promise<string[] | null> {
  const { data, error } = await service
    .from('tutor_subjects')
    .select('subjects(name)')
    .eq('tutor_id', tutorId);

  if (error) {
    console.error('[customerio] tutor subject read failed:', error.message);
    return null;
  }

  const names = ((data ?? []) as unknown as Array<{ subjects: unknown }>).flatMap(row =>
    subjectNamesFrom(row.subjects)
  );

  // De-duplicated: a tutor can list the same subject at two levels, and a
  // repeated value segments no better while making the payload larger.
  return Array.from(new Set(names));
}

export type SyncOutcome =
  | 'sent'
  | 'unchanged'
  | 'disabled'
  | 'skipped'
  | 'not_found'
  | 'failed';

export interface SyncResult {
  outcome: SyncOutcome;
  reason?: string;
}

type AnyClient = ReturnType<typeof getServiceClient>;

/**
 * Record the result of an attempt.
 *
 * The watermark (synced_updated_at) advances ONLY on success. On failure the
 * row keeps its old watermark and gains a failure count, so the reconciler
 * picks it up again next run — until it trips the poison-row threshold in
 * customerio_pending_profiles and parks for an operator to look at.
 */
async function recordAttempt(
  service: AnyClient,
  userId: string,
  succeeded: boolean,
  details: { profileUpdatedAt?: string | null; hash?: string; error?: string }
): Promise<void> {
  const now = new Date().toISOString();

  if (succeeded) {
    const { error } = await service.from('customerio_sync_state').upsert(
      {
        user_id: userId,
        synced_updated_at: details.profileUpdatedAt ?? now,
        attributes_hash: details.hash ?? null,
        synced_at: now,
        last_attempt_at: now,
        failure_count: 0,
        last_error: null,
      },
      { onConflict: 'user_id' }
    );
    if (error) console.error('[customerio] state upsert failed:', error.message);
    return;
  }

  // Read-modify-write rather than an atomic increment: PostgREST cannot express
  // `failure_count = failure_count + 1` in an upsert. A lost increment under
  // concurrency only delays the poison-row cutoff, which is acceptable here —
  // the reconciler is the sole writer in practice.
  const { data: existing } = await service
    .from('customerio_sync_state')
    .select('failure_count')
    .eq('user_id', userId)
    .maybeSingle();

  const { error } = await service.from('customerio_sync_state').upsert(
    {
      user_id: userId,
      failure_count: (existing?.failure_count ?? 0) + 1,
      last_error: details.error?.slice(0, 500) ?? 'unknown',
      last_attempt_at: now,
    },
    { onConflict: 'user_id' }
  );
  if (error) console.error('[customerio] failure state upsert failed:', error.message);
}

/**
 * Sync one profile.
 *
 * `force` bypasses the unchanged-hash check — used by the backfill script, where
 * the point is to (re)deliver every profile regardless of what state says.
 */
export async function syncProfile(
  userId: string,
  options: { force?: boolean; call?: CallOptions } = {}
): Promise<SyncResult> {
  const config = getCustomerIoConfig();
  if (!config) return { outcome: 'disabled' };

  const service = getServiceClient();

  const { data, error } = await service
    .from('profiles')
    .select(PROFILE_SYNC_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[customerio] profile read failed:', error.message);
    return { outcome: 'failed', reason: error.message };
  }
  if (!data) return { outcome: 'not_found' };

  const profile = data as unknown as SyncableProfile;

  const gate = isProfileSyncable(config, profile);
  if (!gate.allowed) {
    // A skip is a decision, not a failure: advance the watermark so the
    // reconciler stops re-examining this row every single run.
    await recordAttempt(service, userId, true, {
      profileUpdatedAt: profile.updated_at,
      hash: `skipped:${gate.reason}`,
    });
    return { outcome: 'skipped', reason: gate.reason };
  }

  const tutorSubjects =
    profile.role === 'tutor' ? await fetchTutorSubjects(service, userId) : null;

  const attributes = buildCustomerAttributes(profile, { tutorSubjects });
  const hash = hashAttributes(attributes);

  if (!options.force) {
    const { data: state } = await service
      .from('customerio_sync_state')
      .select('attributes_hash')
      .eq('user_id', userId)
      .maybeSingle();

    if (state?.attributes_hash === hash) {
      // Nothing Customer.io cares about changed. Move the watermark up so the
      // row leaves the pending set without spending an API call.
      await recordAttempt(service, userId, true, {
        profileUpdatedAt: profile.updated_at,
        hash,
      });
      return { outcome: 'unchanged' };
    }
  }

  const result = await identify(userId, attributes, options.call);

  if (!result.ok) {
    await recordAttempt(service, userId, false, {
      error: result.error ?? result.skipped ?? 'unknown',
    });
    return { outcome: 'failed', reason: result.error ?? result.skipped };
  }

  await recordAttempt(service, userId, true, {
    profileUpdatedAt: profile.updated_at,
    hash,
  });
  return { outcome: 'sent' };
}

/**
 * Sync from inside a user-facing request: one bounded attempt, never throws.
 *
 * Deliberately awaited rather than floated. On Vercel the invocation can be
 * frozen as soon as the response is sent, so a background promise is dropped an
 * unpredictable fraction of the time — and a sync that works locally but not in
 * production is worse than one that costs 200ms.
 *
 * A failure here is not worth surfacing: the reconciler will retry the same
 * profile within minutes, because the watermark was never advanced.
 */
export async function syncProfileNow(userId: string): Promise<SyncResult> {
  try {
    return await syncProfile(userId, { call: REQUEST_PATH_CALL });
  } catch (err) {
    console.error('[customerio] request-path sync threw:', err);
    return { outcome: 'failed', reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Remove a customer on account deletion, and drop our state row with it.
 *
 * Returns whether Customer.io accepted the delete so the caller can log a
 * residual profile — the one failure here that has a privacy consequence.
 */
export async function removeCustomer(userId: string): Promise<boolean> {
  if (!getCustomerIoConfig()) return false;

  const result = await deleteCustomer(userId);
  if (!result.ok) {
    console.error(
      `[customerio] delete failed for ${userId} — profile may still be mailable:`,
      result.error ?? result.skipped
    );
    return false;
  }

  // The profiles FK cascade would clear this anyway; doing it here keeps the
  // two systems consistent even when the profile row outlives the auth user.
  await getServiceClient().from('customerio_sync_state').delete().eq('user_id', userId);
  return true;
}
