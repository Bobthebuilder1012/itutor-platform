import { describe, expect, it } from 'vitest';
import {
  checkTransition,
  knownStatuses,
  profileEffectOfDecision,
  type TransitionEntity,
  type VerificationActor,
} from '@/lib/verification/transitions';

const ACTORS: VerificationActor[] = ['tutor', 'system', 'reviewer', 'admin'];
const ENTITIES: TransitionEntity[] = ['profile', 'request', 'v2', 'identity'];

const code = (r: ReturnType<typeof checkTransition>) => (r.ok ? 'ok' : r.code);

describe('profile status transitions', () => {
  it('lets a tutor ask to be verified, from not-submitted or rejected', () => {
    expect(checkTransition('profile', 'UNVERIFIED', 'PENDING', 'tutor').ok).toBe(true);
    expect(checkTransition('profile', null, 'PENDING', 'tutor').ok).toBe(true); // NULL = UNVERIFIED
    expect(checkTransition('profile', 'REJECTED', 'PENDING', 'tutor').ok).toBe(true);
  });

  it('never lets a tutor declare themselves verified', () => {
    for (const from of ['UNVERIFIED', 'PENDING', 'PROCESSING', 'REJECTED']) {
      expect(code(checkTransition('profile', from, 'VERIFIED', 'tutor'))).toBe('actor_not_allowed');
    }
  });

  it('lets reviewers and admins approve and reject', () => {
    for (const actor of ['reviewer', 'admin'] as const) {
      expect(checkTransition('profile', 'PENDING', 'VERIFIED', actor).ok).toBe(true);
      expect(checkTransition('profile', 'PROCESSING', 'REJECTED', actor).ok).toBe(true);
      expect(checkTransition('profile', 'REJECTED', 'VERIFIED', actor).ok).toBe(true);
    }
  });

  it('only the system moves a profile through processing', () => {
    expect(checkTransition('profile', 'PENDING', 'PROCESSING', 'system').ok).toBe(true);
    expect(checkTransition('profile', 'PROCESSING', 'PENDING', 'system').ok).toBe(true);
    expect(code(checkTransition('profile', 'PENDING', 'PROCESSING', 'tutor'))).toBe('actor_not_allowed');
  });

  describe('VERIFIED', () => {
    it('cannot be rejected by anyone: it must go through revoke', () => {
      for (const actor of ACTORS) {
        expect(code(checkTransition('profile', 'VERIFIED', 'REJECTED', actor))).toBe('use_revoke');
      }
    });

    it('is not dragged back to pending or processing by a new upload or OCR', () => {
      for (const to of ['PENDING', 'PROCESSING', 'UNVERIFIED']) {
        for (const actor of ACTORS) {
          expect(checkTransition('profile', 'VERIFIED', to, actor).ok).toBe(false);
        }
      }
    });

    it('can be revoked by an admin only (default policy)', () => {
      expect(checkTransition('profile', 'VERIFIED', 'REVOKED', 'admin').ok).toBe(true);
      expect(code(checkTransition('profile', 'VERIFIED', 'REVOKED', 'reviewer'))).toBe('actor_not_allowed');
      expect(code(checkTransition('profile', 'VERIFIED', 'REVOKED', 'tutor'))).toBe('actor_not_allowed');
      expect(code(checkTransition('profile', 'VERIFIED', 'REVOKED', 'system'))).toBe('actor_not_allowed');
    });

    it('revoke permission follows the policy config, not hardcoded roles', () => {
      const widened = { revokeAllowedActors: ['admin', 'reviewer'] as VerificationActor[] };
      expect(checkTransition('profile', 'VERIFIED', 'REVOKED', 'reviewer', widened).ok).toBe(true);
      const nobody = { revokeAllowedActors: [] as VerificationActor[] };
      expect(code(checkTransition('profile', 'VERIFIED', 'REVOKED', 'admin', nobody))).toBe('actor_not_allowed');
    });

    it('only VERIFIED can be revoked', () => {
      for (const from of ['UNVERIFIED', 'PENDING', 'PROCESSING', 'REJECTED']) {
        expect(checkTransition('profile', from, 'REVOKED', 'admin').ok).toBe(false);
      }
    });
  });

  describe('REVOKED is a wall', () => {
    it('cannot go back to in-review or not-submitted, for any actor (old upload and review flows)', () => {
      for (const to of ['PENDING', 'PROCESSING', 'UNVERIFIED', 'VERIFIED', 'REJECTED']) {
        for (const actor of ACTORS) {
          expect(code(checkTransition('profile', 'REVOKED', to, actor))).toBe('locked_revoked');
        }
      }
    });

    it('treats staying revoked as a no-op, not an error', () => {
      expect(checkTransition('profile', 'REVOKED', 'REVOKED', 'admin')).toEqual({ ok: true, noop: true });
    });
  });

  it('rejects unknown statuses', () => {
    expect(code(checkTransition('profile', 'WHATEVER', 'VERIFIED', 'admin'))).toBe('transition_not_allowed');
  });

  it('treats same-status as a harmless no-op', () => {
    expect(checkTransition('profile', 'VERIFIED', 'VERIFIED', 'admin')).toEqual({ ok: true, noop: true });
    expect(checkTransition('profile', 'PENDING', 'PENDING', 'tutor')).toEqual({ ok: true, noop: true });
  });
});

describe('request status transitions', () => {
  it('lets the system process a request', () => {
    expect(checkTransition('request', 'SUBMITTED', 'PROCESSING', 'system').ok).toBe(true);
    expect(checkTransition('request', 'PROCESSING', 'READY_FOR_REVIEW', 'system').ok).toBe(true);
    expect(checkTransition('request', 'PROCESSING', 'SUBMITTED', 'system').ok).toBe(true); // failure reset
    expect(code(checkTransition('request', 'SUBMITTED', 'PROCESSING', 'tutor'))).toBe('actor_not_allowed');
  });

  it('a reviewer decides READY_FOR_REVIEW only; an admin may decide earlier states', () => {
    expect(checkTransition('request', 'READY_FOR_REVIEW', 'APPROVED', 'reviewer').ok).toBe(true);
    expect(checkTransition('request', 'READY_FOR_REVIEW', 'REJECTED', 'reviewer').ok).toBe(true);
    expect(code(checkTransition('request', 'SUBMITTED', 'APPROVED', 'reviewer'))).toBe('actor_not_allowed');
    expect(checkTransition('request', 'SUBMITTED', 'APPROVED', 'admin').ok).toBe(true);
  });

  it('an approved request cannot be rejected: that is a revoke', () => {
    for (const actor of ACTORS) {
      expect(code(checkTransition('request', 'APPROVED', 'REJECTED', actor))).toBe('use_revoke');
    }
  });

  it('only an admin may re-approve a rejected request', () => {
    expect(checkTransition('request', 'REJECTED', 'APPROVED', 'admin').ok).toBe(true);
    expect(code(checkTransition('request', 'REJECTED', 'APPROVED', 'reviewer'))).toBe('actor_not_allowed');
  });
});

describe('v2 status transitions', () => {
  it('a tutor submits from in-progress or rejected', () => {
    expect(checkTransition('v2', 'IN_PROGRESS', 'IN_REVIEW', 'tutor').ok).toBe(true);
    expect(checkTransition('v2', 'REJECTED', 'IN_REVIEW', 'tutor').ok).toBe(true);
  });

  it('a tutor cannot decide their own submission', () => {
    expect(code(checkTransition('v2', 'IN_REVIEW', 'VERIFIED', 'tutor'))).toBe('actor_not_allowed');
    expect(code(checkTransition('v2', 'IN_REVIEW', 'REJECTED', 'tutor'))).toBe('actor_not_allowed');
  });

  it('staff decide an in-review submission', () => {
    expect(checkTransition('v2', 'IN_REVIEW', 'VERIFIED', 'reviewer').ok).toBe(true);
    expect(checkTransition('v2', 'IN_REVIEW', 'REJECTED', 'admin').ok).toBe(true);
  });

  it('a verified v2 record cannot be rejected, only revoked by an admin', () => {
    expect(code(checkTransition('v2', 'VERIFIED', 'REJECTED', 'admin'))).toBe('use_revoke');
    expect(checkTransition('v2', 'VERIFIED', 'REVOKED', 'admin').ok).toBe(true);
    expect(code(checkTransition('v2', 'VERIFIED', 'REVOKED', 'reviewer'))).toBe('actor_not_allowed');
  });

  it('a revoked teacher cannot resubmit', () => {
    expect(code(checkTransition('v2', 'REVOKED', 'IN_REVIEW', 'tutor'))).toBe('locked_revoked');
    expect(code(checkTransition('v2', 'REVOKED', 'IN_PROGRESS', 'tutor'))).toBe('locked_revoked');
  });

  it('cannot skip straight from in-progress to a decision', () => {
    expect(checkTransition('v2', 'IN_PROGRESS', 'VERIFIED', 'admin').ok).toBe(false);
  });
});

describe('identity status transitions', () => {
  it('starts with a tutor beginning an attempt', () => {
    expect(checkTransition('identity', null, 'pending', 'tutor').ok).toBe(true);
    expect(code(checkTransition('identity', null, 'verified', 'system'))).toBe('transition_not_allowed');
  });

  it('only the system records Stripe results', () => {
    expect(checkTransition('identity', 'pending', 'verified', 'system').ok).toBe(true);
    expect(code(checkTransition('identity', 'pending', 'verified', 'tutor'))).toBe('actor_not_allowed');
  });

  it('a passed check is never downgraded', () => {
    for (const to of ['pending', 'processing', 'requires_input', 'canceled']) {
      for (const actor of ACTORS) {
        expect(checkTransition('identity', 'verified', to, actor).ok).toBe(false);
      }
    }
  });

  it('the manual-path outcomes are terminal', () => {
    for (const from of ['consent_declined', 'under_supported_age']) {
      for (const to of ['pending', 'verified', 'requires_input']) {
        expect(checkTransition('identity', from, to, 'tutor').ok).toBe(false);
        expect(checkTransition('identity', from, to, 'system').ok).toBe(false);
      }
    }
  });

  it('a failed or cancelled attempt can be retried by the tutor', () => {
    expect(checkTransition('identity', 'requires_input', 'pending', 'tutor').ok).toBe(true);
    expect(checkTransition('identity', 'canceled', 'pending', 'tutor').ok).toBe(true);
  });
});

describe('map-wide properties', () => {
  it('no actor can move anything out of REVOKED', () => {
    for (const entity of ['profile', 'v2'] as const) {
      for (const to of knownStatuses(entity)) {
        if (to === 'REVOKED') continue;
        for (const actor of ACTORS) {
          expect(checkTransition(entity, 'REVOKED', to, actor).ok).toBe(false);
        }
      }
    }
  });

  it('REVOKED is reachable only from VERIFIED, and only by the policy actors', () => {
    for (const entity of ['profile', 'v2'] as const) {
      for (const from of knownStatuses(entity)) {
        for (const actor of ACTORS) {
          const r = checkTransition(entity, from, 'REVOKED', actor);
          const expected = from === 'REVOKED' || (from === 'VERIFIED' && actor === 'admin');
          expect(r.ok).toBe(expected);
        }
      }
    }
  });

  it('only staff can ever produce VERIFIED (never a tutor or the system)', () => {
    for (const entity of ['profile', 'v2'] as const) {
      for (const from of knownStatuses(entity)) {
        for (const actor of ['tutor', 'system'] as const) {
          const r = checkTransition(entity, from, 'VERIFIED', actor);
          // The only ok is the no-op "already VERIFIED".
          if (r.ok) expect(from).toBe('VERIFIED');
        }
      }
    }
  });

  it('every entity has a known state list', () => {
    for (const e of ENTITIES) expect(knownStatuses(e).length).toBeGreaterThan(0);
  });
});

describe('profileEffectOfDecision', () => {
  it('approve verifies anyone except a revoked teacher', () => {
    for (const s of ['UNVERIFIED', null, 'PENDING', 'PROCESSING', 'REJECTED', 'VERIFIED']) {
      expect(profileEffectOfDecision(s, 'APPROVE')).toEqual({ kind: 'set', to: 'VERIFIED' });
    }
    const r = profileEffectOfDecision('REVOKED', 'APPROVE');
    expect(r.kind).toBe('blocked');
  });

  it('reject rejects a not-yet-verified teacher', () => {
    for (const s of ['UNVERIFIED', null, 'PENDING', 'PROCESSING', 'REJECTED']) {
      expect(profileEffectOfDecision(s, 'REJECT')).toEqual({ kind: 'set', to: 'REJECTED' });
    }
  });

  it('reject leaves a VERIFIED or REVOKED teacher alone (rejecting one document is not a revoke)', () => {
    expect(profileEffectOfDecision('VERIFIED', 'REJECT').kind).toBe('unchanged');
    expect(profileEffectOfDecision('REVOKED', 'REJECT').kind).toBe('unchanged');
  });
});
