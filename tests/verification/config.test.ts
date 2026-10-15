import { describe, expect, it } from 'vitest';
import { checkTransition, knownStatuses } from '@/lib/verification/transitions';
import { evidenceFor, evidenceRoutes } from '@/config/verificationEvidence';
import { mayDecideV2, reviewerPolicy, teacherRestrictions, under18Policy } from '@/config/verificationReview';
import { retentionPolicy } from '@/config/verificationRetention';
import { verificationPolicy } from '@/config/verificationPolicy';

describe('REVERIFICATION_REQUIRED status', () => {
  it('is a distinct status on profiles and on v2', () => {
    expect(knownStatuses('profile')).toContain('REVERIFICATION_REQUIRED');
    expect(knownStatuses('v2')).toContain('REVERIFICATION_REQUIRED');
    expect('REVERIFICATION_REQUIRED').not.toBe('REJECTED');
    expect('REVERIFICATION_REQUIRED').not.toBe('REVOKED');
  });

  it('only an admin can ask for it', () => {
    for (const actor of ['tutor', 'system', 'reviewer'] as const) {
      expect(checkTransition('profile', 'VERIFIED', 'REVERIFICATION_REQUIRED', actor).ok).toBe(false);
    }
    expect(checkTransition('profile', 'VERIFIED', 'REVERIFICATION_REQUIRED', 'admin').ok).toBe(true);
    expect(checkTransition('profile', 'PENDING', 'REVERIFICATION_REQUIRED', 'admin').ok).toBe(true);
    expect(checkTransition('v2', 'IN_REVIEW', 'REVERIFICATION_REQUIRED', 'admin').ok).toBe(true);
  });

  it('a REVOKED teacher can never be moved into it', () => {
    expect(checkTransition('profile', 'REVOKED', 'REVERIFICATION_REQUIRED', 'admin')).toMatchObject({ ok: false, code: 'locked_revoked' });
    expect(checkTransition('v2', 'REVOKED', 'REVERIFICATION_REQUIRED', 'admin')).toMatchObject({ ok: false, code: 'locked_revoked' });
  });

  it('the teacher resubmits, then staff decide as normal', () => {
    expect(checkTransition('profile', 'REVERIFICATION_REQUIRED', 'PENDING', 'tutor').ok).toBe(true);
    expect(checkTransition('v2', 'REVERIFICATION_REQUIRED', 'IN_REVIEW', 'tutor').ok).toBe(true);
    expect(checkTransition('profile', 'REVERIFICATION_REQUIRED', 'VERIFIED', 'reviewer').ok).toBe(true);
    expect(checkTransition('profile', 'REVERIFICATION_REQUIRED', 'VERIFIED', 'tutor').ok).toBe(false);
  });

  it('is not verified: only VERIFIED counts', () => {
    expect(checkTransition('profile', 'REVERIFICATION_REQUIRED', 'VERIFIED', 'tutor').ok).toBe(false);
  });
});

describe('open policy decisions are config, with safe defaults', () => {
  it('named reviewer: empty means any admin or reviewer, a list restricts to those people', () => {
    expect(mayDecideV2({ id: 'x', email: 'a@b.c' }, { namedReviewerIds: [], namedReviewerEmails: [] })).toBe(true);
    const only = { namedReviewerIds: ['u1'], namedReviewerEmails: ['Boss@itutor.com'] };
    expect(mayDecideV2({ id: 'u1' }, only)).toBe(true);
    expect(mayDecideV2({ id: 'u2', email: 'boss@ITUTOR.com' }, only)).toBe(true);
    expect(mayDecideV2({ id: 'u2', email: 'other@itutor.com' }, only)).toBe(false);
    expect(mayDecideV2({ id: 'u2' }, only)).toBe(false);
  });

  it('shipped defaults restrict nothing', () => {
    expect(reviewerPolicy.namedReviewerIds).toEqual([]);
    expect(reviewerPolicy.namedReviewerEmails).toEqual([]);
    expect(Object.values(teacherRestrictions.unverified).every((v) => v === false)).toBe(true);
    expect(Object.values(teacherRestrictions.revoked).every((v) => v === false)).toBe(true);
    expect(under18Policy.mode).toBe('manual');
  });

  it('revoke is admin-only by default and lives in config', () => {
    expect(verificationPolicy.revokeAllowedActors).toEqual(['admin']);
  });

  it('retention has placeholder numbers, not hardcoded behaviour', () => {
    expect(typeof retentionPolicy.rejectedDays).toBe('number');
    expect(typeof retentionPolicy.revokedDays).toBe('number');
    expect(typeof retentionPolicy.redactStripeSessionAfterDecision).toBe('boolean');
  });
});

describe('evidence criteria config', () => {
  it('every kind has a generic route', () => {
    for (const kind of ['CSEC', 'CAPE', 'DEGREE'] as const) {
      expect(evidenceFor(kind).length).toBeGreaterThan(0);
    }
  });

  it('a subject-specific route comes before the generic one', () => {
    const m = evidenceFor('CSEC', 'Mathematics');
    expect(m[0].key).toBe('example-maths-csec');
    expect(m.map((r) => r.key)).toContain('csec-general');
  });

  it('does not apply a route to another kind', () => {
    expect(evidenceFor('CAPE', 'Mathematics').every((r) => r.kind === 'CAPE')).toBe(true);
  });

  it('routes filter by subject and level when asked to', () => {
    const routes = [
      { key: 'a', label: 'A', kind: 'CSEC' as const, subjects: ['physics'], levels: ['form 5'], criteria: ['x'] },
      { key: 'g', label: 'G', kind: 'CSEC' as const, subjects: [], levels: [], criteria: ['y'] },
    ];
    expect(evidenceFor('CSEC', 'Physics', 'Form 5', routes).map((r) => r.key)).toEqual(['a', 'g']);
    expect(evidenceFor('CSEC', 'Physics', 'Form 3', routes).map((r) => r.key)).toEqual(['g']);
    expect(evidenceFor('CSEC', 'History', 'Form 5', routes).map((r) => r.key)).toEqual(['g']);
  });

  it('every placeholder is marked TODO so nobody mistakes it for policy', () => {
    const generic = evidenceRoutes.filter((r) => r.subjects.length === 0);
    expect(generic.every((r) => r.criteria.some((c) => c.includes('TODO(policy)')))).toBe(true);
  });
});
