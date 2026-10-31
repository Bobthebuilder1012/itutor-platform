// The ONE place that says which verification status changes are allowed.
// Pure: no I/O, so it is unit-tested directly (tests/verification/transitions.test.ts).
// The server function that applies a change is lib/verification/setStatus.ts.
//
// Four things have a status:
//   profile   profiles.tutor_verification_status        (what the badge reads)
//   request   tutor_verification_requests.status        (old flow, one per upload)
//   v2        tutor_verification_v2.status              (new flow, one per teacher)
//   identity  tutor_verification_v2.identity_status     (Stripe Identity result)
//
// RULES THE MAP ENCODES
//   - VERIFIED is only ever left through REVOKED, and only by the actors in
//     config/verificationPolicy.ts (admin). Nobody moves VERIFIED to REJECTED.
//   - REVOKED has no way out. The old upload flow, the old reviewer flow and the
//     new flow all hit this wall, so a revoked teacher cannot be moved back to
//     "in review" or "not submitted" and resubmit.
//   - Only a tutor starts or restarts a submission (-> PENDING / IN_REVIEW).
//   - Only the system (OCR, Stripe) moves a record through processing.
//   - Only a reviewer or admin decides.

import {
  verificationPolicy,
  type VerificationActor,
  type VerificationPolicy,
} from '@/config/verificationPolicy';

export type { VerificationActor };
export type TransitionEntity = 'profile' | 'request' | 'v2' | 'identity';

export type TransitionErrorCode =
  | 'transition_not_allowed'
  | 'actor_not_allowed'
  | 'use_revoke'
  | 'locked_revoked';

export type TransitionCheck =
  | { ok: true; noop: boolean }
  | { ok: false; code: TransitionErrorCode; message: string };

type Edges = Record<string, Record<string, VerificationActor[]>>;

const STAFF: VerificationActor[] = ['reviewer', 'admin'];

/** Edge into REVOKED. Its actors come from policy, not from this file. */
const REVOKE = '__revoke__' as unknown as VerificationActor[];

const MAPS: Record<TransitionEntity, Edges> = {
  profile: {
    UNVERIFIED: { PENDING: ['tutor'], VERIFIED: STAFF, REJECTED: STAFF },
    PENDING: { PROCESSING: ['system'], VERIFIED: STAFF, REJECTED: STAFF, REVERIFICATION_REQUIRED: ['admin'] },
    PROCESSING: { PENDING: ['system'], VERIFIED: STAFF, REJECTED: STAFF, REVERIFICATION_REQUIRED: ['admin'] },
    VERIFIED: { REVOKED: REVOKE, REVERIFICATION_REQUIRED: ['admin'] },
    REJECTED: { PENDING: ['tutor'], VERIFIED: STAFF },
    // An admin asked this teacher to verify again. Distinct from REJECTED (a
    // decision on an application) and REVOKED (verification taken away). The
    // teacher resubmits; staff then approve or reject as normal.
    REVERIFICATION_REQUIRED: { PENDING: ['tutor'], PROCESSING: ['system'], VERIFIED: STAFF, REJECTED: STAFF },
    REVOKED: {},
  },
  request: {
    // Admin may decide any open request (the SUBMITTED uploads of the second
    // upload flow never reach READY_FOR_REVIEW). A reviewer decides only
    // READY_FOR_REVIEW, as the reviewer routes already enforce.
    SUBMITTED: { PROCESSING: ['system'], APPROVED: ['admin'], REJECTED: ['admin'] },
    PROCESSING: {
      READY_FOR_REVIEW: ['system'],
      SUBMITTED: ['system'],
      APPROVED: ['admin'],
      REJECTED: ['admin'],
    },
    READY_FOR_REVIEW: { APPROVED: STAFF, REJECTED: STAFF },
    APPROVED: {}, // taking an approval back is a revoke, not a request edit
    REJECTED: { APPROVED: ['admin'] }, // admin re-evaluation, as the approve route allows today
  },
  v2: {
    IN_PROGRESS: { IN_REVIEW: ['tutor'], REVERIFICATION_REQUIRED: ['admin'] },
    // IN_PROGRESS from IN_REVIEW is "ask for more information": the application goes back to the
    // teacher with a reason, and they send it again.
    IN_REVIEW: { VERIFIED: STAFF, REJECTED: STAFF, IN_PROGRESS: STAFF, REVERIFICATION_REQUIRED: ['admin'] },
    VERIFIED: { REVOKED: REVOKE, REVERIFICATION_REQUIRED: ['admin'] },
    REJECTED: { IN_REVIEW: ['tutor'], REVERIFICATION_REQUIRED: ['admin'] },
    // TODO(policy, undecided): whether a teacher sent back here must redo the
    // Stripe ID check. Today a passed check stays passed (it is never downgraded).
    REVERIFICATION_REQUIRED: { IN_REVIEW: ['tutor'] },
    REVOKED: {},
  },
  // The NEUTRAL identity outcomes (lib/identity/types.ts). Provider-specific
  // names never reach this map: lib/identity/mapping.ts converts them first.
  identity: {
    // 'NONE' = identity_status is NULL (no session started yet).
    NONE: { pending: ['tutor'] },
    // Staff appear on verified / retryable_failure only for the MANUAL route, where
    // a reviewer records the result instead of a provider.
    pending: {
      processing: ['system'],
      verified: ['system', 'reviewer', 'admin'],
      retryable_failure: ['system', 'reviewer', 'admin'],
      not_supported: ['system'],
      consent_declined: ['system'],
      canceled: ['system'],
    },
    processing: {
      verified: ['system', 'reviewer', 'admin'],
      retryable_failure: ['system', 'reviewer', 'admin'],
      not_supported: ['system'],
      consent_declined: ['system'],
      canceled: ['system'],
    },
    retryable_failure: {
      pending: ['tutor'], // another attempt, same provider
      processing: ['system'],
      verified: ['system', 'reviewer', 'admin'],
      not_supported: ['system'],
      consent_declined: ['system'],
    },
    canceled: { pending: ['tutor'] },
    // The next route. lib/identity/routing.ts decides WHICH provider; the map
    // only allows the teacher to start again.
    not_supported: { pending: ['tutor'] },
    // Only the manual route is offered after this (enforced in routing, not here).
    consent_declined: { pending: ['tutor'] },
    verified: {}, // a passed check is never downgraded
  },
};

/** The 'from' value for a missing/NULL status. */
export function normalizeStatus(entity: TransitionEntity, raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') {
    return entity === 'identity' ? 'NONE' : entity === 'profile' ? 'UNVERIFIED' : '';
  }
  return raw;
}

export function knownStatuses(entity: TransitionEntity): string[] {
  return Object.keys(MAPS[entity]);
}

export function checkTransition(
  entity: TransitionEntity,
  from: string | null | undefined,
  to: string,
  actor: VerificationActor,
  policy: VerificationPolicy = verificationPolicy
): TransitionCheck {
  const f = normalizeStatus(entity, from);
  const edges = MAPS[entity];

  if (!(f in edges)) {
    return {
      ok: false,
      code: 'transition_not_allowed',
      message: `Unknown ${entity} status "${f}"`,
    };
  }
  if (f === to) return { ok: true, noop: true };

  // A revoked teacher cannot be moved by anything. Said clearly, because this
  // is the wall the old upload and reviewer flows run into.
  if (f === 'REVOKED') {
    return {
      ok: false,
      code: 'locked_revoked',
      message: 'This teacher’s verification was revoked and cannot be changed here.',
    };
  }

  // Taking away an approval or a verified status is a revoke, never a reject.
  if (to === 'REJECTED' && (f === 'VERIFIED' || f === 'APPROVED')) {
    return {
      ok: false,
      code: 'use_revoke',
      message: 'A verified teacher cannot be rejected. Use revoke instead.',
    };
  }

  const allowed = edges[f]?.[to];
  if (!allowed) {
    return {
      ok: false,
      code: 'transition_not_allowed',
      message: `${entity} status cannot change from ${f} to ${to}`,
    };
  }

  const actors = allowed === REVOKE ? policy.revokeAllowedActors : allowed;
  if (!actors.includes(actor)) {
    return {
      ok: false,
      code: 'actor_not_allowed',
      message: `A ${actor} cannot change ${entity} status from ${f} to ${to}`,
    };
  }
  return { ok: true, noop: false };
}

export type DecisionEffect =
  | { kind: 'set'; to: 'VERIFIED' | 'REJECTED' }
  | { kind: 'unchanged'; reason: string }
  | { kind: 'blocked'; code: TransitionErrorCode; message: string };

/**
 * What an approve or reject of ONE request does to the teacher's PROFILE status.
 *
 *  - APPROVE: moves the teacher to VERIFIED, except a REVOKED teacher, which is
 *    blocked outright (the old reviewer flow must not reinstate them).
 *  - REJECT: moves the teacher to REJECTED, except a VERIFIED or REVOKED teacher,
 *    whose profile is left alone. Rejecting one pending document of a verified
 *    teacher is a statement about that document, not about the teacher. To take
 *    away verified status, revoke.
 */
export function profileEffectOfDecision(
  currentProfileStatus: string | null | undefined,
  decision: 'APPROVE' | 'REJECT'
): DecisionEffect {
  const cur = normalizeStatus('profile', currentProfileStatus);
  if (decision === 'APPROVE') {
    if (cur === 'REVOKED') {
      return {
        kind: 'blocked',
        code: 'locked_revoked',
        message: 'This teacher’s verification was revoked and cannot be changed here.',
      };
    }
    return { kind: 'set', to: 'VERIFIED' };
  }
  if (cur === 'VERIFIED') {
    return {
      kind: 'unchanged',
      reason: 'The teacher stays verified. Use revoke to remove verified status.',
    };
  }
  if (cur === 'REVOKED') {
    return { kind: 'unchanged', reason: 'The teacher’s verification stays revoked.' };
  }
  return { kind: 'set', to: 'REJECTED' };
}
