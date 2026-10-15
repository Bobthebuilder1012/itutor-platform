import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({
  redacted: [] as string[],
  failRedact: false,
}));

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => { throw new Error('not used'); } }));
vi.mock('@/lib/payments/stripeClient', () => ({
  getStripeClient: () => ({
    identity: {
      verificationSessions: {
        redact: async (id: string) => {
          if (h.failRedact) throw new Error('stripe unavailable');
          h.redacted.push(id);
          return { id };
        },
      },
    },
  }),
}));

import { approveV2, rejectV2, requireReverification, revokeV2 } from '@/lib/verificationV2/review';

const T = 't1';

function seed(opts: { profile?: string | null; v2?: string; identity?: string | null; creds?: number; extra?: Record<string, any> } = {}) {
  const creds = opts.creds ?? 1;
  return makeFakeDb({
    profiles: [
      { id: T, role: 'tutor', tutor_verification_status: opts.profile === undefined ? 'PENDING' : opts.profile, tutor_verified_at: null },
    ],
    tutor_verification_v2: [
      {
        tutor_id: T, status: opts.v2 ?? 'IN_REVIEW', identity_status: opts.identity === undefined ? 'verified' : opts.identity,
        stripe_identity_session_id: 'vs_2', identity_session_history: ['vs_1', 'vs_2'], identity_redacted_at: null,
        files_deleted_at: null, decided_at: null, ...(opts.extra ?? {}),
      },
    ],
    tutor_credentials_v2: Array.from({ length: creds }, (_, i) => ({ id: `c${i}`, tutor_id: T, proof_path: `${T}/a${i}.pdf` })),
    tutor_verification_v2_decisions: [],
    tutor_verified_subjects: [{ id: 's1', tutor_id: T, is_public: true }],
  });
}

const prof = (db: ReturnType<typeof seed>) => db.tables.profiles[0];
const v2 = (db: ReturnType<typeof seed>) => db.tables.tutor_verification_v2[0];
const audit = (db: ReturnType<typeof seed>) => db.tables.tutor_verification_v2_decisions;
const ctx = (db: ReturnType<typeof seed>, actor: 'admin' | 'reviewer' = 'admin') => ({ actor, actorId: 'adm-1', db: db as any });
const writes = (db: ReturnType<typeof seed>) => db.calls.filter((c) => c.op !== 'select');

beforeEach(() => {
  h.redacted = [];
  h.failRedact = false;
});

describe('approveV2', () => {
  it('verifies the application and the teacher, records the decision, redacts every Stripe session', async () => {
    const db = seed();
    const r = await approveV2(ctx(db, 'reviewer'), T);
    expect(r.ok).toBe(true);
    expect(v2(db)).toMatchObject({ status: 'VERIFIED', decided_by: 'adm-1' });
    expect(prof(db).tutor_verification_status).toBe('VERIFIED');
    expect(prof(db).tutor_verified_at).toBeTruthy();
    expect(audit(db)).toHaveLength(1);
    expect(audit(db)[0]).toMatchObject({
      tutor_id: T, actor_id: 'adm-1', actor_role: 'reviewer', action: 'APPROVE',
      from_status: 'IN_REVIEW', to_status: 'VERIFIED', profile_from_status: 'PENDING', profile_to_status: 'VERIFIED',
    });
    expect(h.redacted.sort()).toEqual(['vs_1', 'vs_2']); // failed attempts too
    expect(v2(db).identity_redacted_at).toBeTruthy();
  });

  it('refuses without a passed identity check, and writes nothing', async () => {
    for (const identity of [null, 'pending', 'requires_input', 'consent_declined']) {
      const db = seed({ identity });
      const r = await approveV2(ctx(db), T);
      expect(r).toMatchObject({ ok: false, code: 'identity_not_verified' });
      expect(writes(db)).toEqual([]);
    }
  });

  it('refuses an application with no credentials', async () => {
    const db = seed({ creds: 0 });
    expect(await approveV2(ctx(db), T)).toMatchObject({ ok: false, code: 'no_credentials' });
    expect(writes(db)).toEqual([]);
  });

  it('refuses a REVOKED teacher before writing anything', async () => {
    const db = seed({ profile: 'REVOKED' });
    expect(await approveV2(ctx(db), T)).toMatchObject({ ok: false, code: 'locked_revoked' });
    expect(writes(db)).toEqual([]);
    expect(prof(db).tutor_verification_status).toBe('REVOKED');
  });

  it('refuses an application that is not in review', async () => {
    const db = seed({ v2: 'IN_PROGRESS' });
    expect(await approveV2(ctx(db), T)).toMatchObject({ ok: false, code: 'transition_not_allowed' });
    expect(writes(db)).toEqual([]);
  });

  it('a failed Stripe redaction does not undo the approval', async () => {
    h.failRedact = true;
    const db = seed();
    const r = await approveV2(ctx(db), T);
    expect(r.ok).toBe(true);
    expect(v2(db).status).toBe('VERIFIED');
    if (r.ok) expect(r.redaction).toMatchObject({ ok: false });
    expect(v2(db).identity_redacted_at).toBeNull(); // so the sweep retries it
  });

  it('reports loudly (partial) if the decision was saved but the audit record was not', async () => {
    const db = seed();
    db.failOn.insert = true;
    const r = await approveV2(ctx(db), T);
    expect(r).toMatchObject({ ok: false, partial: true, httpStatus: 500 });
  });

  it('approves a teacher who was asked to reverify', async () => {
    const db = seed({ profile: 'REVERIFICATION_REQUIRED' });
    expect((await approveV2(ctx(db), T)).ok).toBe(true);
    expect(prof(db).tutor_verification_status).toBe('VERIFIED');
  });

  it('returns not_found when the teacher has no application', async () => {
    const db = seed();
    db.tables.tutor_verification_v2 = [];
    expect(await approveV2(ctx(db), T)).toMatchObject({ ok: false, code: 'not_found' });
  });
});

describe('rejectV2', () => {
  it('needs a reason', async () => {
    const db = seed();
    for (const reason of ['', '   ']) {
      expect(await rejectV2(ctx(db), T, reason)).toMatchObject({ ok: false, code: 'reason_required', httpStatus: 400 });
    }
    expect(writes(db)).toEqual([]);
  });

  it('rejects the application, records the reason and moves a pending teacher to REJECTED', async () => {
    const db = seed();
    const r = await rejectV2(ctx(db), T, 'Documents do not match');
    expect(r.ok).toBe(true);
    expect(v2(db)).toMatchObject({ status: 'REJECTED', decision_reason: 'Documents do not match' });
    expect(prof(db).tutor_verification_status).toBe('REJECTED');
    expect(audit(db)[0]).toMatchObject({ action: 'REJECT', reason: 'Documents do not match', profile_to_status: 'REJECTED' });
    expect(h.redacted).toHaveLength(2);
  });

  it('leaves an already-VERIFIED teacher verified', async () => {
    const db = seed({ profile: 'VERIFIED' });
    prof(db).tutor_verified_at = '2026-01-01';
    const r = await rejectV2(ctx(db), T, 'new documents are unreadable');
    expect(r.ok).toBe(true);
    expect(v2(db).status).toBe('REJECTED');
    expect(prof(db).tutor_verification_status).toBe('VERIFIED');
    expect(prof(db).tutor_verified_at).toBe('2026-01-01');
    expect(audit(db)[0].profile_to_status).toBeNull();
    expect(db.calls.some((c) => c.table === 'profiles' && c.op === 'update')).toBe(false);
  });

  it('moves a teacher who was asked to reverify to REJECTED', async () => {
    const db = seed({ profile: 'REVERIFICATION_REQUIRED' });
    await rejectV2(ctx(db), T, 'not acceptable');
    expect(prof(db).tutor_verification_status).toBe('REJECTED');
  });
});

describe('revokeV2', () => {
  it('lets an admin revoke: teacher and application REVOKED, subjects hidden, audited', async () => {
    const db = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    prof(db).tutor_verified_at = '2026-01-01';
    const r = await revokeV2(ctx(db, 'admin'), T, 'Misrepresented qualifications');
    expect(r.ok).toBe(true);
    expect(prof(db)).toMatchObject({ tutor_verification_status: 'REVOKED', tutor_verified_at: null });
    expect(v2(db)).toMatchObject({ status: 'REVOKED', decision_reason: 'Misrepresented qualifications' });
    expect(db.tables.tutor_verified_subjects[0].is_public).toBe(false);
    expect(audit(db)[0]).toMatchObject({ action: 'REVOKE', actor_role: 'admin', profile_to_status: 'REVOKED' });
  });

  it('a reviewer cannot revoke, and nothing changes', async () => {
    const db = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    const r = await revokeV2(ctx(db, 'reviewer'), T, 'x');
    expect(r).toMatchObject({ ok: false, code: 'actor_not_allowed', httpStatus: 403 });
    expect(writes(db)).toEqual([]);
    expect(prof(db).tutor_verification_status).toBe('VERIFIED');
  });

  it('only a verified teacher can be revoked', async () => {
    const db = seed({ profile: 'PENDING' });
    expect(await revokeV2(ctx(db), T, 'x')).toMatchObject({ ok: false, code: 'transition_not_allowed' });
    expect(writes(db)).toEqual([]);
  });

  it('needs a reason', async () => {
    const db = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    expect(await revokeV2(ctx(db), T, ' ')).toMatchObject({ ok: false, code: 'reason_required' });
  });

  it('revokes a teacher verified in the old flow (no v2 record)', async () => {
    const db = seed({ profile: 'VERIFIED' });
    db.tables.tutor_verification_v2 = [];
    const r = await revokeV2(ctx(db), T, 'reason');
    expect(r.ok).toBe(true);
    expect(prof(db).tutor_verification_status).toBe('REVOKED');
  });

  it('reports partial if the public subjects could not be hidden', async () => {
    const db = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    const realFrom = db.from.bind(db);
    (db as any).from = (t: string) => {
      const b: any = realFrom(t);
      if (t !== 'tutor_verified_subjects') return b;
      b.update = () => ({ eq: async () => ({ data: null, error: { message: 'boom' } }) });
      return b;
    };
    expect(await revokeV2(ctx(db), T, 'reason')).toMatchObject({ ok: false, partial: true });
  });
});

describe('requireReverification', () => {
  function many() {
    return makeFakeDb({
      profiles: [
        { id: 'a', role: 'tutor', tutor_verification_status: 'VERIFIED' },
        { id: 'b', role: 'tutor', tutor_verification_status: 'VERIFIED' },
        { id: 'c', role: 'tutor', tutor_verification_status: 'PENDING' },
        { id: 'd', role: 'tutor', tutor_verification_status: 'REVOKED' },
        { id: 'e', role: 'tutor', tutor_verification_status: 'REJECTED' },
        { id: 'f', role: 'student', tutor_verification_status: 'VERIFIED' },
      ],
      tutor_verification_v2: [{ tutor_id: 'a', status: 'VERIFIED', identity_status: 'verified' }],
      tutor_verification_v2_decisions: [],
    });
  }

  it('is a DRY RUN by default: it counts and writes nothing', async () => {
    const db = many();
    const r = await requireReverification({ actor: 'admin', actorId: 'adm', db: db as any }, { scope: 'verified' });
    expect(r).toMatchObject({ dryRun: true, matched: 2, changed: 0 });
    expect(db.calls.filter((c) => c.op !== 'select')).toEqual([]);
  });

  it('applies to verified teachers only, setting profile and v2 and auditing each', async () => {
    const db = many();
    const r = await requireReverification({ actor: 'admin', actorId: 'adm', db: db as any }, { scope: 'verified', dryRun: false, reason: 'new ID check' });
    expect(r).toMatchObject({ dryRun: false, matched: 2, changed: 2, failed: [] });
    const p = Object.fromEntries(db.tables.profiles.map((x: any) => [x.id, x.tutor_verification_status]));
    expect(p).toMatchObject({ a: 'REVERIFICATION_REQUIRED', b: 'REVERIFICATION_REQUIRED', c: 'PENDING', d: 'REVOKED', e: 'REJECTED', f: 'VERIFIED' });
    expect(db.tables.tutor_verification_v2[0].status).toBe('REVERIFICATION_REQUIRED');
    const rows = db.tables.tutor_verification_v2_decisions;
    expect(rows).toHaveLength(2);
    expect(rows[0]!).toMatchObject({ action: 'REQUIRE_REVERIFICATION', reason: 'new ID check', profile_to_status: 'REVERIFICATION_REQUIRED' });
  });

  it('can target pending applicants, and never touches REVOKED teachers', async () => {
    const db = many();
    const r = await requireReverification({ actor: 'admin', actorId: 'adm', db: db as any }, { scope: 'both', dryRun: false });
    expect(r).toMatchObject({ matched: 3, changed: 3 });
    expect(db.tables.profiles.find((x: any) => x.id === 'd')!.tutor_verification_status).toBe('REVOKED');
  });

  it('can target specific teachers; a revoked one is skipped, not changed', async () => {
    const db = many();
    const r = await requireReverification({ actor: 'admin', actorId: 'adm', db: db as any }, { tutorIds: ['a', 'd'], dryRun: false });
    expect(r).toMatchObject({ scope: 'ids', matched: 2, changed: 1, skipped: 1 });
    expect(db.tables.profiles.find((x: any) => x.id === 'd')!.tutor_verification_status).toBe('REVOKED');
  });

  it('a reviewer cannot do it at all', async () => {
    const db = many();
    const r = await requireReverification({ actor: 'reviewer', actorId: 'rev', db: db as any }, { scope: 'verified', dryRun: false });
    expect(r).toMatchObject({ ok: false, code: 'actor_not_allowed' });
    expect(db.calls.filter((c) => c.op !== 'select')).toEqual([]);
  });

  it('this is a distinct status: not REJECTED and not REVOKED', async () => {
    const db = many();
    await requireReverification({ actor: 'admin', actorId: 'adm', db: db as any }, { scope: 'verified', dryRun: false });
    const status = db.tables.profiles[0]!.tutor_verification_status;
    expect(status).not.toBe('REJECTED');
    expect(status).not.toBe('REVOKED');
  });
});
