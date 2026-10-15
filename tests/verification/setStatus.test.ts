import { describe, expect, it, vi } from 'vitest';
import { makeFakeDb } from '../helpers/fakeDb';

// setStatus imports the real service-client factory; it is never called because
// every test passes its own fake db.
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => { throw new Error('not used'); } }));

import {
  setIdentityStatus,
  setProfileStatus,
  setRequestStatus,
  setV2Status,
} from '@/lib/verification/setStatus';
import { applyRequestDecision } from '@/lib/verification/decide';

const TUTOR = 'tutor-1';

function seed(profileStatus: string | null, requestStatus = 'READY_FOR_REVIEW') {
  return makeFakeDb({
    profiles: [{ id: TUTOR, tutor_verification_status: profileStatus, tutor_verified_at: null }],
    tutor_verification_requests: [{ id: 'req-1', tutor_id: TUTOR, status: requestStatus }],
  });
}

const profile = (db: ReturnType<typeof seed>) => db.tables.profiles[0];
const request = (db: ReturnType<typeof seed>) => db.tables.tutor_verification_requests[0];

describe('setProfileStatus', () => {
  it('applies an allowed change and sets tutor_verified_at when verifying', async () => {
    const db = seed('PENDING');
    const r = await setProfileStatus({ tutorId: TUTOR, to: 'VERIFIED', actor: 'reviewer', db: db as any });
    expect(r).toMatchObject({ ok: true, from: 'PENDING', to: 'VERIFIED', changed: true });
    expect(profile(db).tutor_verification_status).toBe('VERIFIED');
    expect(profile(db).tutor_verified_at).toBeTruthy();
  });

  it('returns the refusal and writes nothing when the map says no', async () => {
    const db = seed('VERIFIED');
    const r = await setProfileStatus({ tutorId: TUTOR, to: 'REJECTED', actor: 'reviewer', db: db as any });
    expect(r).toMatchObject({ ok: false, code: 'use_revoke', httpStatus: 409 });
    expect(profile(db).tutor_verification_status).toBe('VERIFIED');
    expect(db.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('a revoked teacher cannot be moved back to pending by a tutor upload', async () => {
    const db = seed('REVOKED');
    const r = await setProfileStatus({ tutorId: TUTOR, to: 'PENDING', actor: 'tutor', db: db as any });
    expect(r).toMatchObject({ ok: false, code: 'locked_revoked' });
    expect(profile(db).tutor_verification_status).toBe('REVOKED');
  });

  it('only an admin may revoke, and revoke clears the verified date', async () => {
    const db = seed('VERIFIED');
    profile(db).tutor_verified_at = '2026-01-01';

    const denied = await setProfileStatus({ tutorId: TUTOR, to: 'REVOKED', actor: 'reviewer', db: db as any });
    expect(denied).toMatchObject({ ok: false, code: 'actor_not_allowed', httpStatus: 403 });
    expect(profile(db).tutor_verification_status).toBe('VERIFIED');

    const done = await setProfileStatus({ tutorId: TUTOR, to: 'REVOKED', actor: 'admin', db: db as any });
    expect(done.ok).toBe(true);
    expect(profile(db).tutor_verification_status).toBe('REVOKED');
    expect(profile(db).tutor_verified_at).toBeNull();
  });

  it('treats a NULL status as UNVERIFIED', async () => {
    const db = seed(null);
    const r = await setProfileStatus({ tutorId: TUTOR, to: 'PENDING', actor: 'tutor', db: db as any });
    expect(r).toMatchObject({ ok: true, from: 'UNVERIFIED', changed: true });
  });

  it('is a no-op, not an error, when already in the target status', async () => {
    const db = seed('PENDING');
    const r = await setProfileStatus({ tutorId: TUTOR, to: 'PENDING', actor: 'tutor', db: db as any });
    expect(r).toMatchObject({ ok: true, changed: false });
    expect(db.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('returns a database failure instead of swallowing it', async () => {
    const db = seed('PENDING');
    db.failOn.update = true;
    const r = await setProfileStatus({ tutorId: TUTOR, to: 'VERIFIED', actor: 'admin', db: db as any });
    expect(r).toMatchObject({ ok: false, code: 'db_error', httpStatus: 500 });
  });

  it('returns not_found for an unknown teacher', async () => {
    const db = seed('PENDING');
    const r = await setProfileStatus({ tutorId: 'nobody', to: 'VERIFIED', actor: 'admin', db: db as any });
    expect(r).toMatchObject({ ok: false, code: 'not_found', httpStatus: 404 });
  });
});

describe('setRequestStatus', () => {
  it('records the decision fields on approve and reject', async () => {
    const db = seed('PENDING');
    const r = await setRequestStatus({
      requestId: 'req-1', to: 'REJECTED', actor: 'reviewer', reviewerId: 'rev-9', reason: 'blurry', db: db as any,
    });
    expect(r).toMatchObject({ ok: true, tutorId: TUTOR });
    expect(request(db)).toMatchObject({
      status: 'REJECTED', reviewer_decision: 'REJECT', reviewed_by: 'rev-9', reviewer_reason: 'blurry',
    });
  });

  it('only the system may attach processing fields', async () => {
    const db = seed('PENDING', 'PROCESSING');
    const r = await setRequestStatus({
      requestId: 'req-1', to: 'READY_FOR_REVIEW', actor: 'admin', fields: { extracted_text: 'x' }, db: db as any,
    });
    expect(r).toMatchObject({ ok: false, code: 'actor_not_allowed' });
    expect(request(db).status).toBe('PROCESSING');
  });
});

describe('setV2Status and setIdentityStatus', () => {
  function v2(status: string, identity: string | null = null) {
    return makeFakeDb({
      tutor_verification_v2: [{
        tutor_id: TUTOR, status, identity_status: identity, identity_error_code: null,
        stripe_identity_session_id: 'vs_current', identity_provider: 'stripe',
        identity_provider_session_ref: 'vs_current', identity_attempts: 1,
      }],
    });
  }

  it('submit is allowed from in-progress only once', async () => {
    const db = v2('IN_PROGRESS');
    expect((await setV2Status({ tutorId: TUTOR, to: 'IN_REVIEW', actor: 'tutor', db: db as any })).ok).toBe(true);
    expect(db.tables.tutor_verification_v2[0].submitted_at).toBeTruthy();
    // second submit is a no-op: already in review
    const again = await setV2Status({ tutorId: TUTOR, to: 'IN_REVIEW', actor: 'tutor', db: db as any });
    expect(again).toMatchObject({ ok: true, changed: false });
  });

  it('a revoked v2 teacher cannot resubmit', async () => {
    const db = v2('REVOKED');
    const r = await setV2Status({ tutorId: TUTOR, to: 'IN_REVIEW', actor: 'tutor', db: db as any });
    expect(r).toMatchObject({ ok: false, code: 'locked_revoked' });
    expect(db.tables.tutor_verification_v2[0].status).toBe('REVOKED');
  });

  it('ignores an identity result for a replaced session', async () => {
    const db = v2('IN_PROGRESS', 'pending');
    const r = await setIdentityStatus({
      tutorId: TUTOR, to: 'verified', actor: 'system', sessionRef: 'vs_OLD', db: db as any,
    });
    expect(r).toMatchObject({ ok: false, code: 'stale_session' });
    expect(db.tables.tutor_verification_v2[0].identity_status).toBe('pending');
  });

  it('never downgrades a passed identity check', async () => {
    const db = v2('IN_PROGRESS', 'verified');
    const r = await setIdentityStatus({
      tutorId: TUTOR, to: 'retryable_failure', reason: 'document_expired', actor: 'system', sessionRef: 'vs_current', db: db as any,
    });
    expect(r.ok).toBe(false);
    expect(db.tables.tutor_verification_v2[0].identity_status).toBe('verified');
  });

  it('ignores a result from a different provider than the current session', async () => {
    const db = v2('IN_PROGRESS', 'pending');
    const r = await setIdentityStatus({
      tutorId: TUTOR, to: 'verified', actor: 'system', sessionRef: 'vs_current', provider: 'didit', db: db as any,
    });
    expect(r).toMatchObject({ ok: false, code: 'stale_session' });
  });

  it('reads an OLD row that still holds a Stripe status name as its neutral equivalent', async () => {
    const db = v2('IN_PROGRESS', 'requires_input');
    db.tables.tutor_verification_v2[0].identity_error_code = 'document_expired';
    // requires_input == retryable_failure, so verified is a legal next step and the write matches the stored value
    const r = await setIdentityStatus({
      tutorId: TUTOR, to: 'verified', actor: 'system', sessionRef: 'vs_current', db: db as any,
    });
    expect(r).toMatchObject({ ok: true, from: 'retryable_failure' });
    expect(db.tables.tutor_verification_v2[0].identity_status).toBe('verified');
  });

  it('records the neutral reason and the raw provider code separately', async () => {
    const db = v2('IN_PROGRESS', 'pending');
    await setIdentityStatus({
      tutorId: TUTOR, to: 'not_supported', reason: 'country', providerCode: 'country_not_supported',
      actor: 'system', sessionRef: 'vs_current', db: db as any,
    });
    expect(db.tables.tutor_verification_v2[0]).toMatchObject({
      identity_status: 'not_supported', identity_error_code: 'country', identity_provider_code: 'country_not_supported',
    });
  });

  it('applies a verified result for the current session', async () => {
    const db = v2('IN_PROGRESS', 'pending');
    const r = await setIdentityStatus({
      tutorId: TUTOR, to: 'verified', actor: 'system', sessionRef: 'vs_current', db: db as any,
    });
    expect(r.ok).toBe(true);
    expect(db.tables.tutor_verification_v2[0].identity_status).toBe('verified');
    expect(db.tables.tutor_verification_v2[0].identity_verified_at).toBeTruthy();
  });
});

describe('applyRequestDecision (admin and reviewer decisions)', () => {
  it('a reviewer rejecting a request of a VERIFIED teacher rejects the request but leaves the teacher verified', async () => {
    const db = seed('VERIFIED');
    const r = await applyRequestDecision({
      requestId: 'req-1', decision: 'REJECT', actor: 'reviewer', reviewerId: 'rev-1', reason: 'bad scan', db: db as any,
    });
    expect(r.ok).toBe(true);
    expect(request(db).status).toBe('REJECTED');
    expect(profile(db).tutor_verification_status).toBe('VERIFIED');
    if (r.ok) expect(r.profile.effect).toBe('unchanged');
  });

  it('a reviewer cannot move a verified teacher to rejected by any route', async () => {
    const db = seed('VERIFIED');
    await applyRequestDecision({
      requestId: 'req-1', decision: 'REJECT', actor: 'reviewer', reviewerId: 'rev-1', db: db as any,
    });
    expect(profile(db).tutor_verification_status).not.toBe('REJECTED');
  });

  it('an admin rejecting an APPROVED request is told to use revoke and nothing changes', async () => {
    const db = seed('VERIFIED', 'APPROVED');
    const r = await applyRequestDecision({
      requestId: 'req-1', decision: 'REJECT', actor: 'admin', reviewerId: 'adm-1', reason: 'x', db: db as any,
    });
    expect(r).toMatchObject({ ok: false, code: 'use_revoke', httpStatus: 409 });
    expect(request(db).status).toBe('APPROVED');
    expect(profile(db).tutor_verification_status).toBe('VERIFIED');
  });

  it('approving for a REVOKED teacher is blocked before anything is written', async () => {
    const db = seed('REVOKED');
    const r = await applyRequestDecision({
      requestId: 'req-1', decision: 'APPROVE', actor: 'reviewer', reviewerId: 'rev-1', db: db as any,
    });
    expect(r).toMatchObject({ ok: false, code: 'locked_revoked' });
    expect(request(db).status).toBe('READY_FOR_REVIEW');
    expect(profile(db).tutor_verification_status).toBe('REVOKED');
    expect(db.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('approve moves request and teacher together', async () => {
    const db = seed('PROCESSING');
    const r = await applyRequestDecision({
      requestId: 'req-1', decision: 'APPROVE', actor: 'reviewer', reviewerId: 'rev-1', db: db as any,
    });
    expect(r.ok).toBe(true);
    expect(request(db).status).toBe('APPROVED');
    expect(profile(db).tutor_verification_status).toBe('VERIFIED');
  });

  it('reject moves an unverified teacher to REJECTED', async () => {
    const db = seed('PENDING');
    await applyRequestDecision({
      requestId: 'req-1', decision: 'REJECT', actor: 'reviewer', reviewerId: 'rev-1', reason: 'r', db: db as any,
    });
    expect(profile(db).tutor_verification_status).toBe('REJECTED');
  });

  it('returns a failure when the profile write fails after the request was decided (partial)', async () => {
    const db = seed('PENDING');
    // Fail only the profile update: wrap from() so profiles updates error.
    const realFrom = db.from.bind(db);
    (db as any).from = (t: string) => {
      const b: any = realFrom(t);
      if (t !== 'profiles') return b;
      const origUpdate = b.update.bind(b);
      b.update = (p: any) => {
        const q = origUpdate(p);
        q.then = (res: any) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(res);
        q.select = () => q;
        return q;
      };
      return b;
    };
    const r = await applyRequestDecision({
      requestId: 'req-1', decision: 'APPROVE', actor: 'reviewer', reviewerId: 'rev-1', db: db as any,
    });
    expect(r).toMatchObject({ ok: false, code: 'db_error', partial: true });
  });
});
