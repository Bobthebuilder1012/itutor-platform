// Approve or reject ONE verification request, used by all four decision routes
// (admin approve, admin reject, reviewer decide, reviewer bulk-decide).
//
// It checks both the request transition and the profile effect BEFORE writing
// anything, so a refused change (revoked teacher, wrong actor, verified teacher)
// leaves nothing half-done. Only a database fault between the two writes can
// leave the request decided and the profile not; that is returned as
// `partial: true` and logged, never swallowed.

import { getServiceClient } from '@/lib/supabase/server';
import {
  checkTransition,
  normalizeStatus,
  profileEffectOfDecision,
  type VerificationActor,
} from './transitions';
import {
  setProfileStatus,
  setRequestStatus,
  type Db,
  type StatusFailure,
} from './setStatus';

export interface DecisionSuccess {
  ok: true;
  tutorId: string;
  profile:
    | { effect: 'set'; from: string; to: string; changed: boolean }
    | { effect: 'unchanged'; note: string };
}

export async function applyRequestDecision(opts: {
  requestId: string;
  decision: 'APPROVE' | 'REJECT';
  actor: Extract<VerificationActor, 'reviewer' | 'admin'>;
  reviewerId: string;
  reason?: string | null;
  db?: Db;
}): Promise<DecisionSuccess | StatusFailure> {
  const db = opts.db ?? (getServiceClient() as Db);
  const toRequest = opts.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const refuse = (code: StatusFailure['code'], message: string, httpStatus: number): StatusFailure => ({
    ok: false,
    code,
    message,
    httpStatus,
  });

  // --- read ---
  const { data: req, error: reqErr } = await db
    .from('tutor_verification_requests')
    .select('status, tutor_id')
    .eq('id', opts.requestId)
    .maybeSingle();
  if (reqErr) return refuse('db_error', 'Could not read the verification request', 500);
  if (!req) return refuse('not_found', 'Verification request not found', 404);

  const { data: prof, error: profErr } = await db
    .from('profiles')
    .select('tutor_verification_status')
    .eq('id', req.tutor_id)
    .maybeSingle();
  if (profErr) return refuse('db_error', 'Could not read the teacher’s status', 500);
  if (!prof) return refuse('not_found', 'Teacher not found', 404);

  // --- check both, write nothing yet ---
  const reqCheck = checkTransition('request', req.status, toRequest, opts.actor);
  if (!reqCheck.ok) {
    return refuse(reqCheck.code, reqCheck.message, reqCheck.code === 'actor_not_allowed' ? 403 : 409);
  }

  const effect = profileEffectOfDecision(prof.tutor_verification_status, opts.decision);
  if (effect.kind === 'blocked') return refuse(effect.code, effect.message, 409);

  if (effect.kind === 'set') {
    const profCheck = checkTransition('profile', prof.tutor_verification_status, effect.to, opts.actor);
    if (!profCheck.ok) {
      return refuse(profCheck.code, profCheck.message, profCheck.code === 'actor_not_allowed' ? 403 : 409);
    }
  }

  // --- write ---
  const decided = await setRequestStatus({
    requestId: opts.requestId,
    to: toRequest,
    actor: opts.actor,
    reviewerId: opts.reviewerId,
    reason: opts.reason,
    db,
  });
  if (!decided.ok) return decided;

  if (effect.kind === 'unchanged') {
    return { ok: true, tutorId: req.tutor_id, profile: { effect: 'unchanged', note: effect.reason } };
  }

  const moved = await setProfileStatus({ tutorId: req.tutor_id, to: effect.to, actor: opts.actor, db });
  if (!moved.ok) {
    console.error(
      `[verification/decide] request ${opts.requestId} is ${toRequest} but the profile was not updated: ${moved.message}`
    );
    return { ...moved, partial: true };
  }
  return {
    ok: true,
    tutorId: req.tutor_id,
    profile: {
      effect: 'set',
      from: normalizeStatus('profile', prof.tutor_verification_status),
      to: effect.to,
      changed: moved.changed,
    },
  };
}

/** The actor a decision is recorded as: the admin role, or a reviewer. */
export function decisionActor(profile: { role?: string | null }): 'admin' | 'reviewer' {
  return profile.role === 'admin' ? 'admin' : 'reviewer';
}
