// The ONE server function for verification status changes.
//
// Every write to profiles.tutor_verification_status,
// tutor_verification_requests.status, tutor_verification_v2.status and
// tutor_verification_v2.identity_status goes through here, so the rules in
// lib/verification/transitions.ts cannot be skipped by a route that forgets them.
//
//   - Always the service client. A trigger (migration 217) refuses status writes
//     from anyone else, and a teacher must never be able to write one.
//   - Reads the current status, checks the transition, then writes CONDITIONALLY
//     on that status. A concurrent change makes the write match no rows and the
//     caller gets 'conflict', not a silent overwrite.
//   - Returns every failure. Nothing here swallows an error.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server';
import {
  checkTransition,
  normalizeStatus,
  type TransitionErrorCode,
  type VerificationActor,
} from './transitions';
import { normalizeIdentityReason, normalizeIdentityStatus } from '@/lib/identity/mapping';

export type Db = SupabaseClient<any, 'public', any>;

export type StatusErrorCode =
  | TransitionErrorCode
  | 'not_found'
  | 'conflict'
  | 'stale_session'
  | 'db_error';

export interface StatusFailure {
  ok: false;
  code: StatusErrorCode;
  message: string;
  httpStatus: number;
  /** A multi-step change that failed AFTER an earlier step was already saved. */
  partial?: boolean;
}

export interface StatusSuccess {
  ok: true;
  from: string;
  to: string;
  /** false when the status was already the target (or only a no-op). */
  changed: boolean;
}

const HTTP: Record<StatusErrorCode, number> = {
  transition_not_allowed: 409,
  actor_not_allowed: 403,
  use_revoke: 409,
  locked_revoked: 409,
  not_found: 404,
  conflict: 409,
  stale_session: 409,
  db_error: 500,
};

function fail(code: StatusErrorCode, message: string): StatusFailure {
  return { ok: false, code, message, httpStatus: HTTP[code] };
}

/** A route's ready-made error response. */
export function statusErrorResponse(failure: StatusFailure, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { error: failure.message, code: failure.code, ...extra },
    { status: failure.httpStatus }
  );
}

/** Failures that mean "this change is not allowed here", as opposed to a fault. */
export function isRuleRefusal(f: StatusFailure): boolean {
  return (
    f.code === 'transition_not_allowed' ||
    f.code === 'actor_not_allowed' ||
    f.code === 'use_revoke' ||
    f.code === 'locked_revoked'
  );
}

const now = () => new Date().toISOString();

// ---------------------------------------------------------------
// profile
// ---------------------------------------------------------------
export async function setProfileStatus(opts: {
  tutorId: string;
  to: string;
  actor: VerificationActor;
  db?: Db;
}): Promise<StatusSuccess | StatusFailure> {
  const db = opts.db ?? (getServiceClient() as Db);

  const { data: cur, error } = await db
    .from('profiles')
    .select('tutor_verification_status')
    .eq('id', opts.tutorId)
    .maybeSingle();
  if (error) return fail('db_error', 'Could not read the teacher’s status');
  if (!cur) return fail('not_found', 'Teacher not found');

  const raw: string | null = cur.tutor_verification_status ?? null;
  const from = normalizeStatus('profile', raw);
  const check = checkTransition('profile', raw, opts.to, opts.actor);
  if (!check.ok) return fail(check.code, check.message);
  if (check.noop) return { ok: true, from, to: opts.to, changed: false };

  const patch: Record<string, unknown> = { tutor_verification_status: opts.to };
  if (opts.to === 'VERIFIED') patch.tutor_verified_at = now();
  if (opts.to === 'REJECTED' || opts.to === 'REVOKED') patch.tutor_verified_at = null;

  let q = db.from('profiles').update(patch).eq('id', opts.tutorId);
  q = raw === null ? q.is('tutor_verification_status', null) : q.eq('tutor_verification_status', raw);
  const { data, error: upErr } = await q.select('id');
  if (upErr) return fail('db_error', 'Could not update the teacher’s status');
  if (!data || data.length === 0) return fail('conflict', 'The status changed while you were saving. Refresh and try again.');
  return { ok: true, from, to: opts.to, changed: true };
}

// ---------------------------------------------------------------
// request (tutor_verification_requests)
// ---------------------------------------------------------------
export async function setRequestStatus(opts: {
  requestId: string;
  to: string;
  actor: VerificationActor;
  /** profiles.id of the reviewer or admin making the decision. */
  reviewerId?: string;
  reason?: string | null;
  /** Extra columns, e.g. OCR output. Only the system may set these. */
  fields?: Record<string, unknown>;
  db?: Db;
}): Promise<(StatusSuccess & { tutorId: string }) | StatusFailure> {
  const db = opts.db ?? (getServiceClient() as Db);

  if (opts.fields && opts.actor !== 'system') {
    return fail('actor_not_allowed', 'Only the system may set processing fields');
  }

  const { data: cur, error } = await db
    .from('tutor_verification_requests')
    .select('status, tutor_id')
    .eq('id', opts.requestId)
    .maybeSingle();
  if (error) return fail('db_error', 'Could not read the verification request');
  if (!cur) return fail('not_found', 'Verification request not found');

  const check = checkTransition('request', cur.status, opts.to, opts.actor);
  if (!check.ok) return fail(check.code, check.message);
  if (check.noop) return { ok: true, from: cur.status, to: opts.to, changed: false, tutorId: cur.tutor_id };

  const patch: Record<string, unknown> = { status: opts.to, updated_at: now(), ...(opts.fields ?? {}) };
  if (opts.to === 'APPROVED' || opts.to === 'REJECTED') {
    patch.reviewer_decision = opts.to === 'APPROVED' ? 'APPROVE' : 'REJECT';
    patch.reviewed_by = opts.reviewerId ?? null;
    patch.reviewed_at = now();
    if (opts.reason !== undefined) patch.reviewer_reason = opts.reason;
  }

  const { data, error: upErr } = await db
    .from('tutor_verification_requests')
    .update(patch)
    .eq('id', opts.requestId)
    .eq('status', cur.status)
    .select('id');
  if (upErr) return fail('db_error', 'Could not update the verification request');
  if (!data || data.length === 0) return fail('conflict', 'The request changed while you were saving. Refresh and try again.');
  return { ok: true, from: cur.status, to: opts.to, changed: true, tutorId: cur.tutor_id };
}

// ---------------------------------------------------------------
// v2 (tutor_verification_v2.status)
// ---------------------------------------------------------------
export async function setV2Status(opts: {
  tutorId: string;
  to: string;
  actor: VerificationActor;
  reviewerId?: string;
  reason?: string | null;
  db?: Db;
}): Promise<StatusSuccess | StatusFailure> {
  const db = opts.db ?? (getServiceClient() as Db);

  const { data: cur, error } = await db
    .from('tutor_verification_v2')
    .select('status')
    .eq('tutor_id', opts.tutorId)
    .maybeSingle();
  if (error) return fail('db_error', 'Could not read the verification');
  if (!cur) return fail('not_found', 'No verification in progress');

  const check = checkTransition('v2', cur.status, opts.to, opts.actor);
  if (!check.ok) return fail(check.code, check.message);
  if (check.noop) return { ok: true, from: cur.status, to: opts.to, changed: false };

  const patch: Record<string, unknown> = { status: opts.to };
  if (opts.to === 'IN_REVIEW') {
    patch.submitted_at = now();
    patch.decision_reason = null;
    patch.decided_by = null;
    patch.decided_at = null;
  } else if (opts.to === 'VERIFIED' || opts.to === 'REJECTED' || opts.to === 'REVOKED') {
    patch.decision_reason = opts.reason ?? null;
    patch.decided_by = opts.reviewerId ?? null;
    patch.decided_at = now();
  }

  const { data, error: upErr } = await db
    .from('tutor_verification_v2')
    .update(patch)
    .eq('tutor_id', opts.tutorId)
    .eq('status', cur.status)
    .select('tutor_id');
  if (upErr) return fail('db_error', 'Could not update the verification');
  if (!data || data.length === 0) return fail('conflict', 'Your submission changed. Please refresh.');
  return { ok: true, from: cur.status, to: opts.to, changed: true };
}

// ---------------------------------------------------------------
// identity (tutor_verification_v2.identity_status)
// ---------------------------------------------------------------
// Speaks the NEUTRAL outcomes only (lib/identity/types.ts). Old rows that still
// hold Stripe's names are normalised on the way in, so they keep working.
export async function setIdentityStatus(opts: {
  tutorId: string;
  to: string;
  /** The neutral reason (retry reason or not-supported reason), or null. */
  reason?: string | null;
  /** The provider's raw code, kept for coverage testing. Never branched on. */
  providerCode?: string | null;
  /** The document type the provider reported, for the outcomes log. A label only. */
  documentType?: string | null;
  actor: VerificationActor;
  /** Webhook / refresh: only apply if this is still the teacher's current session. */
  sessionRef?: string;
  /** With sessionRef: the provider that session belongs to. */
  provider?: string;
  /** Optimistic guard for starting an attempt. */
  expectAttempts?: number;
  /** Extra columns written with the change (attempt count, new session, country). */
  extra?: Record<string, unknown>;
  db?: Db;
}): Promise<StatusSuccess | StatusFailure> {
  const db = opts.db ?? (getServiceClient() as Db);

  const { data: cur, error } = await db
    .from('tutor_verification_v2')
    .select(
      'identity_status, identity_error_code, identity_provider, identity_provider_session_ref, stripe_identity_session_id, identity_attempts, identity_country, identity_started_at'
    )
    .eq('tutor_id', opts.tutorId)
    .maybeSingle();
  if (error) return fail('db_error', 'Could not read the identity check');
  if (!cur) return fail('not_found', 'No verification in progress');

  // Rows from before provider-agnostic identity have no provider columns: their
  // session is the old Stripe column.
  const currentRef: string | null = cur.identity_provider_session_ref ?? cur.stripe_identity_session_id ?? null;
  const currentProvider: string | null = cur.identity_provider ?? (cur.stripe_identity_session_id ? 'stripe' : null);

  // An event for a session (or provider) we already replaced must not touch the current one.
  if (opts.sessionRef && currentRef !== opts.sessionRef) {
    return fail('stale_session', 'That identity session is no longer the current one');
  }
  if (opts.provider && currentProvider && currentProvider !== opts.provider) {
    return fail('stale_session', 'That identity session belongs to a different provider');
  }

  const storedFrom: string | null = cur.identity_status ?? null;
  const normFrom = normalizeIdentityStatus(storedFrom);
  const from = normalizeStatus('identity', normFrom);
  const check = checkTransition('identity', normFrom, opts.to, opts.actor);
  if (!check.ok) return fail(check.code, check.message);

  const reason = opts.reason ?? null;
  const sameReason = normalizeIdentityReason(storedFrom, cur.identity_error_code) === reason;
  if (check.noop && sameReason && !opts.extra && storedFrom === normFrom) {
    return { ok: true, from, to: opts.to, changed: false };
  }

  const patch: Record<string, unknown> = {
    identity_status: opts.to,
    identity_error_code: reason,
    ...(opts.providerCode !== undefined ? { identity_provider_code: opts.providerCode } : {}),
    ...(opts.extra ?? {}),
  };
  if (opts.to === 'verified' && !check.noop) patch.identity_verified_at = now();

  // Conditional on the value AS STORED (which may be a legacy name).
  let q = db.from('tutor_verification_v2').update(patch).eq('tutor_id', opts.tutorId);
  q = storedFrom === null ? q.is('identity_status', null) : q.eq('identity_status', storedFrom);
  if (opts.expectAttempts !== undefined) q = q.eq('identity_attempts', opts.expectAttempts);

  const { data, error: upErr } = await q.select('tutor_id');
  if (upErr) return fail('db_error', 'Could not update the identity check');
  if (!data || data.length === 0) return fail('conflict', 'The identity check changed. Please refresh.');

  // One row per FINISHED attempt, for the coverage scorecard. Never personal data:
  // provider, country, document TYPE, neutral outcome, codes, timing. A failure to
  // log never undoes or blocks the status change.
  if (FINISHED.includes(opts.to)) {
    const started = cur.identity_started_at ? Date.parse(cur.identity_started_at) : NaN;
    const { error: logErr } = await db.from('identity_outcomes').insert({
      tutor_id: opts.tutorId,
      provider: cur.identity_provider ?? currentProvider,
      session_ref: currentRef,
      country: cur.identity_country ?? null,
      document_type: opts.documentType ?? null,
      outcome: opts.to,
      reason: reason,
      provider_code: opts.providerCode ?? null,
      attempt: cur.identity_attempts ?? null,
      duration_seconds: Number.isFinite(started) ? Math.max(0, Math.round((Date.now() - started) / 1000)) : null,
    });
    if (logErr) console.error('[identity-outcomes] could not log outcome:', logErr.message);
  }
  return { ok: true, from, to: opts.to, changed: true };
}

const FINISHED = ['verified', 'retryable_failure', 'not_supported', 'consent_declined', 'canceled'];
