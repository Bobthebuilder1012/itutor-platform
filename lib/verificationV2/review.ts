// Admin and reviewer decisions on v2 applications: approve, reject, revoke and
// "reverification required". Every change goes through lib/verification/setStatus.ts
// (so the allowed-transition map applies) and every decision is written to the
// append-only audit table (migration 272).
//
// After a change is saved the teacher gets an in-app notice (lib/verificationV2/notify.ts,
// behind VERIFICATION_V2_ENABLED). A notice that fails to write never undoes or blocks
// the decision; it is reported as `notification: 'failed'`.
//
// What this never does: send an email, read an ID image (v2 holds none; the check is
// the provider's), or change anything if a check fails. Both the v2 and the profile
// transition are checked BEFORE the first write.

import { getServiceClient } from '@/lib/supabase/server';
import {
  checkTransition,
  normalizeStatus,
  profileEffectOfDecision,
  type VerificationActor,
} from '@/lib/verification/transitions';
import {
  setProfileStatus,
  setV2Status,
  type Db,
  type StatusFailure,
} from '@/lib/verification/setStatus';
import type { RedactResult } from './redaction';
import type { DeletionResult } from './fileDeletion';
import { afterApproval, afterRejection, afterRevocation } from './afterDecision';
import { notifyTeacher, type NotifyStatus } from './notify';

export type ReviewActor = Extract<VerificationActor, 'reviewer' | 'admin'>;

export interface ReviewCtx {
  actor: ReviewActor;
  actorId: string;
  db?: Db;
}

export type ReviewFailure =
  | StatusFailure
  | { ok: false; code: 'identity_not_verified' | 'no_credentials' | 'reason_required'; message: string; httpStatus: number; partial?: boolean };

export interface ReviewSuccess {
  ok: true;
  from: string;
  to: string;
  profile: { from: string; to: string | null; changed: boolean };
  redaction?: RedactResult;
  files?: DeletionResult;
  /** What happened to the teacher's in-app notice. 'skipped' while the flag is off. */
  notification?: NotifyStatus;
}

const fail = (
  code: 'identity_not_verified' | 'no_credentials' | 'reason_required',
  message: string,
  httpStatus = 409
): ReviewFailure => ({ ok: false, code, message, httpStatus });

type AuditAction = 'APPROVE' | 'REJECT' | 'REVOKE' | 'REQUIRE_REVERIFICATION';

/** Appends to the audit table. Returns an error string, or null. */
export async function recordDecision(
  db: Db,
  d: {
    tutorId: string;
    actor: ReviewActor;
    actorId: string;
    action: AuditAction;
    from: string | null;
    to: string | null;
    profileFrom: string | null;
    profileTo: string | null;
    reason?: string | null;
  }
): Promise<string | null> {
  const { error } = await db.from('tutor_verification_v2_decisions').insert({
    tutor_id: d.tutorId,
    actor_id: d.actorId,
    actor_role: d.actor,
    action: d.action,
    from_status: d.from,
    to_status: d.to,
    profile_from_status: d.profileFrom,
    profile_to_status: d.profileTo,
    reason: d.reason ?? null,
  });
  return error ? error.message : null;
}

async function loadV2(db: Db, tutorId: string) {
  const { data, error } = await db
    .from('tutor_verification_v2')
    .select('status, identity_status')
    .eq('tutor_id', tutorId)
    .maybeSingle();
  return { row: data as { status: string; identity_status: string | null } | null, error };
}

async function loadProfileStatus(db: Db, tutorId: string) {
  const { data, error } = await db
    .from('profiles')
    .select('tutor_verification_status')
    .eq('id', tutorId)
    .maybeSingle();
  return { found: !!data, status: (data?.tutor_verification_status ?? null) as string | null, error };
}

const refusal = (c: { code: any; message: string }): StatusFailure => ({
  ok: false,
  code: c.code,
  message: c.message,
  httpStatus: c.code === 'actor_not_allowed' ? 403 : 409,
});

const dbFail = (message: string): StatusFailure => ({ ok: false, code: 'db_error', message, httpStatus: 500 });
const notFound = (message: string): StatusFailure => ({ ok: false, code: 'not_found', message, httpStatus: 404 });

/** Hide the old-flow public verified subjects (used by revoke, as the old route does). */
async function hideVerifiedSubjects(db: Db, tutorId: string): Promise<string | null> {
  const { error } = await db.from('tutor_verified_subjects').update({ is_public: false }).eq('tutor_id', tutorId);
  return error ? error.message : null;
}

// ---------------------------------------------------------------
// approve
// ---------------------------------------------------------------
export async function approveV2(ctx: ReviewCtx, tutorId: string): Promise<ReviewSuccess | ReviewFailure> {
  const db = ctx.db ?? (getServiceClient() as Db);

  const { row, error } = await loadV2(db, tutorId);
  if (error) return dbFail('Could not read the application');
  if (!row) return notFound('No application found for this teacher');

  // The two things a reviewer is signing off must really be there.
  if (row.identity_status !== 'verified') {
    return fail('identity_not_verified', 'The identity check has not passed. The teacher has to complete it before this can be approved.');
  }
  const { count, error: cErr } = await db
    .from('tutor_credentials_v2')
    .select('id', { count: 'exact', head: true })
    .eq('tutor_id', tutorId);
  if (cErr) return dbFail('Could not read the credentials');
  if (!count) return fail('no_credentials', 'The application has no credentials.');

  const prof = await loadProfileStatus(db, tutorId);
  if (prof.error) return dbFail('Could not read the teacher');
  if (!prof.found) return notFound('Teacher not found');

  // Check everything before writing anything.
  const v2Check = checkTransition('v2', row.status, 'VERIFIED', ctx.actor);
  if (!v2Check.ok) return refusal(v2Check);
  const effect = profileEffectOfDecision(prof.status, 'APPROVE');
  if (effect.kind === 'blocked') return refusal(effect);
  if (effect.kind === 'set') {
    const pc = checkTransition('profile', prof.status, effect.to, ctx.actor);
    if (!pc.ok) return refusal(pc);
  }

  const v2 = await setV2Status({ tutorId, to: 'VERIFIED', actor: ctx.actor, reviewerId: ctx.actorId, db });
  if (!v2.ok) return v2;

  const moved = await setProfileStatus({ tutorId, to: 'VERIFIED', actor: ctx.actor, db });
  if (!moved.ok) {
    console.error(`[verification-v2/review] ${tutorId}: v2 approved but profile not updated: ${moved.message}`);
    return { ...moved, partial: true };
  }

  // Saved: tell the teacher now, even if the audit write below fails.
  const notified = await notifyTeacher(db, tutorId, { kind: 'verified' });

  const auditError = await recordDecision(db, {
    tutorId, actor: ctx.actor, actorId: ctx.actorId, action: 'APPROVE',
    from: row.status, to: 'VERIFIED', profileFrom: normalizeStatus('profile', prof.status), profileTo: 'VERIFIED',
  });
  if (auditError) {
    console.error(`[verification-v2/review] ${tutorId}: approved but the audit record failed: ${auditError}`);
    return { ok: false, code: 'db_error', message: 'Approved, but the decision record could not be saved.', httpStatus: 500, partial: true };
  }

  // After the decision is saved: Stripe stops holding the ID. Never blocks it.
  const { redaction } = await afterApproval(tutorId, db);
  return {
    ok: true,
    from: row.status,
    to: 'VERIFIED',
    profile: { from: normalizeStatus('profile', prof.status), to: 'VERIFIED', changed: moved.changed },
    redaction,
    notification: notified.status,
  };
}

// ---------------------------------------------------------------
// reject
// ---------------------------------------------------------------
export async function rejectV2(
  ctx: ReviewCtx,
  tutorId: string,
  reason: string
): Promise<ReviewSuccess | ReviewFailure> {
  const db = ctx.db ?? (getServiceClient() as Db);
  const why = (reason ?? '').trim();
  if (!why) return fail('reason_required', 'A reason is required to reject.', 400);

  const { row, error } = await loadV2(db, tutorId);
  if (error) return dbFail('Could not read the application');
  if (!row) return notFound('No application found for this teacher');

  const prof = await loadProfileStatus(db, tutorId);
  if (prof.error) return dbFail('Could not read the teacher');
  if (!prof.found) return notFound('Teacher not found');

  const v2Check = checkTransition('v2', row.status, 'REJECTED', ctx.actor);
  if (!v2Check.ok) return refusal(v2Check);
  // A verified teacher whose new application is rejected stays verified; only
  // revoke takes that away (same rule as the old flow).
  const effect = profileEffectOfDecision(prof.status, 'REJECT');
  if (effect.kind === 'set') {
    const pc = checkTransition('profile', prof.status, effect.to, ctx.actor);
    if (!pc.ok) return refusal(pc);
  }

  const v2 = await setV2Status({ tutorId, to: 'REJECTED', actor: ctx.actor, reviewerId: ctx.actorId, reason: why, db });
  if (!v2.ok) return v2;

  let profileChanged = false;
  let profileTo: string | null = null;
  if (effect.kind === 'set') {
    const moved = await setProfileStatus({ tutorId, to: effect.to, actor: ctx.actor, db });
    if (!moved.ok) {
      console.error(`[verification-v2/review] ${tutorId}: v2 rejected but profile not updated: ${moved.message}`);
      return { ...moved, partial: true };
    }
    profileChanged = moved.changed;
    profileTo = effect.to;
  }

  const notified = await notifyTeacher(db, tutorId, { kind: 'rejected', reason: why });

  const auditError = await recordDecision(db, {
    tutorId, actor: ctx.actor, actorId: ctx.actorId, action: 'REJECT', reason: why,
    from: row.status, to: 'REJECTED', profileFrom: normalizeStatus('profile', prof.status), profileTo,
  });
  if (auditError) {
    console.error(`[verification-v2/review] ${tutorId}: rejected but the audit record failed: ${auditError}`);
    return { ok: false, code: 'db_error', message: 'Rejected, but the decision record could not be saved.', httpStatus: 500, partial: true };
  }

  // Files go after the retention period; 0 means straight away.
  const { redaction, files } = await afterRejection(tutorId, db);

  return {
    ok: true,
    from: row.status,
    to: 'REJECTED',
    profile: { from: normalizeStatus('profile', prof.status), to: profileTo, changed: profileChanged },
    redaction,
    files,
    notification: notified.status,
  };
}

// ---------------------------------------------------------------
// revoke
// ---------------------------------------------------------------
export async function revokeV2(
  ctx: ReviewCtx,
  tutorId: string,
  reason: string
): Promise<ReviewSuccess | ReviewFailure> {
  const db = ctx.db ?? (getServiceClient() as Db);
  const why = (reason ?? '').trim();
  if (!why) return fail('reason_required', 'A reason is required to revoke.', 400);

  const prof = await loadProfileStatus(db, tutorId);
  if (prof.error) return dbFail('Could not read the teacher');
  if (!prof.found) return notFound('Teacher not found');
  const { row, error } = await loadV2(db, tutorId);
  if (error) return dbFail('Could not read the application');

  // Check both before writing. VERIFIED -> REVOKED, admin only (config).
  const pc = checkTransition('profile', prof.status, 'REVOKED', ctx.actor);
  if (!pc.ok) return refusal(pc);
  if (row && row.status === 'VERIFIED') {
    const vc = checkTransition('v2', row.status, 'REVOKED', ctx.actor);
    if (!vc.ok) return refusal(vc);
  }

  const moved = await setProfileStatus({ tutorId, to: 'REVOKED', actor: ctx.actor, db });
  if (!moved.ok) return moved;

  if (row && row.status === 'VERIFIED') {
    const v2 = await setV2Status({ tutorId, to: 'REVOKED', actor: ctx.actor, reviewerId: ctx.actorId, reason: why, db });
    if (!v2.ok) {
      console.error(`[verification-v2/review] ${tutorId}: profile revoked but v2 not: ${v2.message}`);
      return { ...v2, partial: true };
    }
  }

  // Revoked: tell the teacher now, even if a later step fails. Without a v2 record
  // that was just revoked there is no fresh decided_at, so the stamp is the time now.
  const notified = await notifyTeacher(
    db,
    tutorId,
    { kind: 'revoked', reason: why },
    row && row.status === 'VERIFIED' ? {} : { stamp: new Date().toISOString() }
  );

  const hideError = await hideVerifiedSubjects(db, tutorId);
  if (hideError) {
    console.error(`[verification-v2/review] ${tutorId}: revoked but verified subjects not hidden: ${hideError}`);
    return { ok: false, code: 'db_error', message: 'Revoked, but the public subjects could not be hidden.', httpStatus: 500, partial: true };
  }

  const auditError = await recordDecision(db, {
    tutorId, actor: ctx.actor, actorId: ctx.actorId, action: 'REVOKE', reason: why,
    from: row?.status ?? null, to: row?.status === 'VERIFIED' ? 'REVOKED' : null,
    profileFrom: normalizeStatus('profile', prof.status), profileTo: 'REVOKED',
  });
  if (auditError) {
    console.error(`[verification-v2/review] ${tutorId}: revoked but the audit record failed: ${auditError}`);
    return { ok: false, code: 'db_error', message: 'Revoked, but the decision record could not be saved.', httpStatus: 500, partial: true };
  }

  const { redaction, files } = await afterRevocation(tutorId, db);

  return {
    ok: true,
    from: row?.status ?? 'VERIFIED',
    to: 'REVOKED',
    profile: { from: normalizeStatus('profile', prof.status), to: 'REVOKED', changed: moved.changed },
    redaction,
    files,
    notification: notified.status,
  };
}

// ---------------------------------------------------------------
// reverification required
// ---------------------------------------------------------------
export type ReverifyScope = 'verified' | 'pending' | 'both';

export interface ReverifyReport {
  dryRun: boolean;
  scope: ReverifyScope | 'ids';
  matched: number;
  changed: number;
  skipped: number;
  failed: { tutorId: string; error: string }[];
  tutorIds: string[];
  /** Teachers whose in-app notice could not be written (their status DID change). */
  notificationsFailed: number;
}

/**
 * Asks teachers to verify again. Admin only. Defaults to a DRY RUN that only
 * counts. Nothing runs this automatically. Each teacher whose status changes gets an
 * in-app notice (no email), and their status page picks the change up on its own.
 *
 *   verified  existing VERIFIED teachers
 *   pending   applicants mid-review in the old flow (PENDING / PROCESSING)
 *   both      the two above
 *   ids       exactly these teachers
 */
export async function requireReverification(
  ctx: ReviewCtx,
  opts: { scope?: ReverifyScope; tutorIds?: string[]; reason?: string | null; dryRun?: boolean; limit?: number }
): Promise<ReverifyReport | ReviewFailure> {
  const db = ctx.db ?? (getServiceClient() as Db);
  const dryRun = opts.dryRun !== false;
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);

  // Fail early, for the whole batch, if this actor may not do it at all.
  const gate = checkTransition('profile', 'VERIFIED', 'REVERIFICATION_REQUIRED', ctx.actor);
  if (!gate.ok) return refusal(gate);

  let query = db.from('profiles').select('id, tutor_verification_status').eq('role', 'tutor');
  let scope: ReverifyReport['scope'];
  if (opts.tutorIds && opts.tutorIds.length > 0) {
    scope = 'ids';
    query = query.in('id', opts.tutorIds.slice(0, limit));
  } else {
    scope = opts.scope ?? 'verified';
    const statuses =
      scope === 'verified' ? ['VERIFIED'] : scope === 'pending' ? ['PENDING', 'PROCESSING'] : ['VERIFIED', 'PENDING', 'PROCESSING'];
    query = query.in('tutor_verification_status', statuses).limit(limit);
  }
  const { data: tutors, error } = await query;
  if (error) return dbFail('Could not list teachers');

  const report: ReverifyReport = {
    dryRun, scope, matched: (tutors ?? []).length, changed: 0, skipped: 0, failed: [],
    tutorIds: (tutors ?? []).map((t: any) => t.id),
    notificationsFailed: 0,
  };
  if (dryRun) return report;

  for (const t of tutors ?? []) {
    const profileFrom = normalizeStatus('profile', t.tutor_verification_status);
    const pc = checkTransition('profile', profileFrom, 'REVERIFICATION_REQUIRED', ctx.actor);
    if (!pc.ok) {
      report.skipped++;
      continue;
    }
    const moved = await setProfileStatus({ tutorId: t.id, to: 'REVERIFICATION_REQUIRED', actor: ctx.actor, db });
    if (!moved.ok) {
      report.failed.push({ tutorId: t.id, error: moved.message });
      continue;
    }

    // Their v2 record, if any, follows (it may be absent for an old teacher).
    const { row } = await loadV2(db, t.id);
    let v2From: string | null = null;
    if (row && checkTransition('v2', row.status, 'REVERIFICATION_REQUIRED', ctx.actor).ok) {
      const v2 = await setV2Status({ tutorId: t.id, to: 'REVERIFICATION_REQUIRED', actor: ctx.actor, db });
      if (!v2.ok) {
        report.failed.push({ tutorId: t.id, error: `profile set, v2 record not: ${v2.message}` });
        continue;
      }
      v2From = row.status;
    }

    // Their status changed: tell them. The stamp is the time now unless a v2 decision
    // is on record, so a later round of reverification is a new notice.
    const notified = await notifyTeacher(db, t.id, { kind: 'reverification_required' }, { stamp: new Date().toISOString() });
    if (notified.status === 'failed') report.notificationsFailed++;

    const auditError = await recordDecision(db, {
      tutorId: t.id, actor: ctx.actor, actorId: ctx.actorId, action: 'REQUIRE_REVERIFICATION',
      reason: opts.reason ?? null, from: v2From, to: v2From ? 'REVERIFICATION_REQUIRED' : null,
      profileFrom, profileTo: 'REVERIFICATION_REQUIRED',
    });
    if (auditError) {
      report.failed.push({ tutorId: t.id, error: `changed, but the decision record failed: ${auditError}` });
      continue;
    }
    report.changed++;
  }
  return report;
}
