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
  CUSTOMERIO_PROFILE_VIEW,
  type CustomerIoProfileRow,
} from './attributes';

/**
 * The origin used to build class links in the attribute payload.
 *
 * Falls back to the production site rather than to a relative path: a
 * half-formed URL in an email is worse than a link that points at the live
 * site from a preview.
 */
function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://myitutor.com';
}

/**
 * Does this error mean the activation view has not been migrated here?
 *
 * Mirrors the isSchemaMismatch predicate the group routes use for the same
 * class of drift between environments.
 */
function isMissingView(error: { code?: string; message?: string } | null): boolean {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  );
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

  // One read. The view flattens the activation facts that used to require a
  // second tutor_subjects query, so there is no longer a path where a profile
  // ships with some of its attributes and not others.
  const { data, error } = await service
    .from(CUSTOMERIO_PROFILE_VIEW)
    .select('*')
    .eq('customer_id', userId)
    .maybeSingle();

  if (error) {
    // Deliberately NOT degraded to a plain profiles read. Every "send only if"
    // test in the activation ladders branches on a counter that exists only in
    // this view — so falling back would ship a payload in which
    // classes_created_count is simply absent, and Customer.io would evaluate
    // those conditions against a missing attribute rather than a real zero.
    // A campaign that mails the wrong people is worse than one that pauses, so
    // this fails loudly and the cron response carries the count.
    if (isMissingView(error)) {
      console.error(
        `[customerio] ${CUSTOMERIO_PROFILE_VIEW} is missing — apply migration 259 ` +
          'before enabling the sync on this environment.'
      );
      return { outcome: 'failed', reason: 'activation_view_missing' };
    }
    console.error('[customerio] profile read failed:', error.message);
    return { outcome: 'failed', reason: error.message };
  }
  if (!data) return { outcome: 'not_found' };

  const profile = data as unknown as CustomerIoProfileRow;

  // The watermark is the activation timestamp, never profiles.updated_at:
  // counters that live on groups and enrolments never touch the profile row,
  // so storing updated_at here would either lose the change or re-queue the
  // row forever. This is the single line the whole freshness design rests on.
  const watermark = profile.activation_updated_at ?? profile.updated_at;

  const gate = isProfileSyncable(config, profile);
  if (!gate.allowed) {
    // A skip is a decision, not a failure: advance the watermark so the
    // reconciler stops re-examining this row every single run.
    //
    // NOTE FOR LAUNCH: this is what makes CUSTOMERIO_ALLOWED_EMAILS a trap.
    // Running with the allowlist set marks every other profile as delivered,
    // and clearing it later does NOT bring them back — a dormant profile's
    // activation_updated_at never moves again. Before widening the allowlist,
    // reset the rows this wrote:
    //   UPDATE customerio_sync_state SET synced_updated_at = NULL,
    //     attributes_hash = NULL WHERE attributes_hash LIKE 'skipped:%';
    await recordAttempt(service, userId, true, {
      profileUpdatedAt: watermark,
      hash: `skipped:${gate.reason}`,
    });
    return { outcome: 'skipped', reason: gate.reason };
  }

  const attributes = buildCustomerAttributes(profile, { appUrl: appUrl() });
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
        profileUpdatedAt: watermark,
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
    profileUpdatedAt: watermark,
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
