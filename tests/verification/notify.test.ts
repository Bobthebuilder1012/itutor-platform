import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({ db: null as any }));

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.db }));
vi.mock('@/lib/payments/stripeClient', () => ({
  getStripeClient: () => ({ identity: { verificationSessions: { redact: async (id: string) => ({ id }) } } }),
}));
vi.mock('@/lib/verificationV2/server', async (orig) => ({
  ...(await orig<typeof import('@/lib/verificationV2/server')>()),
  guardV2: async () => ({ error: null, tutorId: 't1', db: h.db, revoked: false, profileStatus: null }),
}));

import { approveV2, rejectV2, requireReverification, revokeV2 } from '@/lib/verificationV2/review';
import { buildNotice, notifyIdentityOutcome, notifyTeacher, VERIFICATION_PAGE } from '@/lib/verificationV2/notify';
import { applyProviderOutcome } from '@/lib/identity/webhook';
import { loadPublicSummaries } from '@/lib/verificationV2/publicView';
import { POST as submitPOST } from '@/app/api/tutor/verification-v2/submit/route';
import { pollIntervalMs, shouldPoll, stateSignature } from '@/lib/verificationV2/poll';
import { SUMMARY_TTL_MS, isSummaryFresh } from '@/lib/verificationV2/clientHooks';
import type { VerificationV2StateDto } from '@/lib/verificationV2/constants';

const T = 't1';
const ctx = (db: any) => ({ actor: 'admin' as const, actorId: 'adm-1', db });

function seed(o: { profile?: string; v2?: string; extra?: Record<string, any>; creds?: number } = {}) {
  return makeFakeDb({
    profiles: [{ id: T, role: 'tutor', tutor_verification_status: o.profile ?? 'PENDING', tutor_verified_at: null }],
    tutor_verification_v2: [
      {
        tutor_id: T, status: o.v2 ?? 'IN_REVIEW', identity_status: 'verified', consent_at: '2026-10-01T00:00:00Z',
        stripe_identity_session_id: 'vs_2', identity_session_history: ['vs_2'], identity_redacted_at: null,
        files_deleted_at: null, decided_at: null, submitted_at: null, ...(o.extra ?? {}),
      },
    ],
    tutor_credentials_v2: Array.from({ length: o.creds ?? 1 }, (_, i) => ({ id: `c${i}`, tutor_id: T, proof_path: `${T}/a${i}.pdf` })),
    tutor_extras_v2: [],
    tutor_verification_v2_decisions: [],
    tutor_verified_subjects: [{ id: 's1', tutor_id: T, is_public: true }],
    notifications: [],
    identity_outcomes: [],
  });
}
const notices = (db: ReturnType<typeof seed>) => db.tables.notifications;

const inProgressCheck = () =>
  seed({
    extra: {
      status: 'IN_PROGRESS', identity_status: 'pending', identity_provider: 'didit',
      identity_provider_session_ref: 's-1', identity_attempts: 1,
    },
  });
const delivery = { eventId: 'e1', sessionRef: 's-1', tutorId: T, ignore: false, outcome: null, livemode: null } as any;
const failedResult = { outcome: { kind: 'retryable_failure', reason: 'abandoned' }, providerCode: 'x' } as any;

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  process.env.VERIFICATION_V2_ENABLED = 'true';
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.VERIFICATION_V2_ENABLED;
  errorSpy.mockRestore();
});

// ---------------------------------------------------------------
describe('the wording and the type of each notice', () => {
  it('every notice has a type, a title and a message, and none names a provider', () => {
    const all = [
      buildNotice({ kind: 'in_review' }),
      buildNotice({ kind: 'verified' }),
      buildNotice({ kind: 'rejected', reason: 'Blurry proof' }),
      buildNotice({ kind: 'revoked', reason: 'Fake degree' }),
      buildNotice({ kind: 'reverification_required' }),
      buildNotice({ kind: 'identity_failed', status: 'retryable_failure', reason: 'document_expired' }, { attemptsLeft: 2 }),
    ];
    for (const n of all) {
      expect(n.type).toMatch(/^VERIFICATION_/);
      expect(n.title.length).toBeGreaterThan(5);
      expect(n.message.length).toBeGreaterThan(10);
      expect(`${n.title} ${n.message}`).not.toMatch(/stripe|didit|veriff/i);
    }
  });

  it('rejected and revoked carry the reason', () => {
    expect(buildNotice({ kind: 'rejected', reason: 'Blurry proof' }).message).toContain('Blurry proof');
    expect(buildNotice({ kind: 'revoked', reason: 'Fake degree' }).message).toContain('Fake degree');
  });

  it('a failed check says how many attempts are left, with the right plural', () => {
    const msg = (left: number) =>
      buildNotice({ kind: 'identity_failed', status: 'retryable_failure', reason: 'abandoned' }, { attemptsLeft: left }).message;
    expect(msg(2)).toContain('2 attempts left');
    expect(msg(1)).toContain('1 attempt left');
    expect(msg(0)).toContain('no attempts left');
    expect(msg(-1)).toContain('no attempts left');
  });
});

// ---------------------------------------------------------------
describe('a notice for every status change, in-app, linking to the verification page', () => {
  it('Verified', async () => {
    const db = seed();
    const r: any = await approveV2(ctx(db), T);
    expect(r.ok).toBe(true);
    expect(r.notification).toBe('sent');
    expect(notices(db)).toHaveLength(1);
    expect(notices(db)[0]).toMatchObject({ user_id: T, type: 'VERIFICATION_APPROVED', link: VERIFICATION_PAGE, is_read: false });
    expect(VERIFICATION_PAGE).toBe('/tutor/verification-v2');
  });

  it('Rejected, with the reason', async () => {
    const db = seed();
    const r: any = await rejectV2(ctx(db), T, 'The degree scan is unreadable');
    expect(r.ok).toBe(true);
    expect(notices(db)).toHaveLength(1);
    expect(notices(db)[0]).toMatchObject({ type: 'VERIFICATION_REJECTED', link: VERIFICATION_PAGE });
    expect(notices(db)[0].message).toContain('The degree scan is unreadable');
  });

  it('Revoked, with the reason', async () => {
    const db = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    const r: any = await revokeV2(ctx(db), T, 'Credentials were forged');
    expect(r.ok).toBe(true);
    expect(notices(db)).toHaveLength(1);
    expect(notices(db)[0]).toMatchObject({ type: 'VERIFICATION_REVOKED', link: VERIFICATION_PAGE });
    expect(notices(db)[0].message).toContain('Credentials were forged');
  });

  it('Reverification required', async () => {
    const db = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    const r: any = await requireReverification(ctx(db), { tutorIds: [T], dryRun: false });
    expect(r.changed).toBe(1);
    expect(r.notificationsFailed).toBe(0);
    expect(notices(db)).toHaveLength(1);
    expect(notices(db)[0]).toMatchObject({ type: 'VERIFICATION_REVERIFICATION_REQUIRED', link: VERIFICATION_PAGE });
  });

  it('a dry run of reverification notifies nobody', async () => {
    const db = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    await requireReverification(ctx(db), { tutorIds: [T], dryRun: true });
    expect(notices(db)).toHaveLength(0);
  });

  it('In review (the teacher submits)', async () => {
    const db = seed({ v2: 'IN_PROGRESS' });
    h.db = db;
    const res = await submitPOST();
    expect(res.status).toBe(200);
    expect(db.tables.tutor_verification_v2[0].status).toBe('IN_REVIEW');
    expect(notices(db)).toHaveLength(1);
    expect(notices(db)[0]).toMatchObject({ type: 'VERIFICATION_IN_REVIEW', link: VERIFICATION_PAGE });
  });

  it('A failed or retryable check, with the attempts left', async () => {
    const db = inProgressCheck();
    const out = await applyProviderOutcome(db as any, 'didit', delivery, {
      outcome: { kind: 'retryable_failure', reason: 'document_expired' },
      providerCode: 'raw',
    });
    expect(out).toBe('applied');
    expect(db.tables.tutor_verification_v2[0].identity_status).toBe('retryable_failure');
    expect(notices(db)).toHaveLength(1);
    expect(notices(db)[0]).toMatchObject({ type: 'VERIFICATION_CHECK_FAILED', link: VERIFICATION_PAGE });
    expect(notices(db)[0].message).toContain('2 attempts left');
  });

  it('a passed identity check, a pending or processing check and a cancellation are not announced', async () => {
    const db = seed();
    for (const s of ['verified', 'pending', 'processing', 'canceled']) {
      expect((await notifyIdentityOutcome(db as any, T, s, null)).status).toBe('skipped');
    }
    expect(notices(db)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------
describe('one notice per change: duplicates', () => {
  it('the same Didit or Stripe delivery applied again creates no second notice', async () => {
    const db = inProgressCheck();
    await applyProviderOutcome(db as any, 'didit', delivery, failedResult);
    await applyProviderOutcome(db as any, 'didit', delivery, failedResult);
    await applyProviderOutcome(db as any, 'didit', { ...delivery, eventId: 'e2' }, failedResult); // a re-send under a new event id
    expect(notices(db)).toHaveLength(1);
  });

  it('the database index, not only the code, refuses a second insert with the same key', async () => {
    const db = seed();
    const first = await notifyTeacher(db as any, T, { kind: 'in_review' }, { stamp: 'same' });
    const again = await notifyTeacher(db as any, T, { kind: 'in_review' }, { stamp: 'same' });
    const other = await notifyTeacher(db as any, T, { kind: 'in_review' }, { stamp: 'next-submission' });
    expect([first.status, again.status, other.status]).toEqual(['sent', 'duplicate', 'sent']);
    expect(notices(db)).toHaveLength(2);
  });

  it('approving twice notifies once (the second attempt is refused by the status rules)', async () => {
    const db = seed();
    await approveV2(ctx(db), T);
    await approveV2(ctx(db), T);
    expect(notices(db).filter((n: any) => n.type === 'VERIFICATION_APPROVED')).toHaveLength(1);
  });

  it('a later, separate change is a new notice (rejected, resubmitted, rejected again)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
      const db = seed();
      await rejectV2(ctx(db), T, 'first reason');
      // The teacher resubmits and a reviewer decides again, later.
      db.tables.tutor_verification_v2[0].status = 'IN_REVIEW';
      vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
      await rejectV2(ctx(db), T, 'second reason');
      expect(notices(db)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------
describe('the flag is off', () => {
  beforeEach(() => {
    process.env.VERIFICATION_V2_ENABLED = 'false';
  });

  it('notifyTeacher does nothing and never touches the database', async () => {
    const db = seed();
    const r = await notifyTeacher(db as any, T, { kind: 'verified' });
    expect(r.status).toBe('skipped');
    expect(db.calls).toHaveLength(0);
  });

  it('decisions still work and write no notice', async () => {
    const db = seed();
    const r: any = await approveV2(ctx(db), T);
    expect(r.ok).toBe(true);
    expect(r.notification).toBe('skipped');
    expect(notices(db)).toHaveLength(0);
    expect(db.calls.filter((c) => c.table === 'notifications')).toHaveLength(0);
  });

  it('a failed check changes the status and writes no notice', async () => {
    const db = inProgressCheck();
    await applyProviderOutcome(db as any, 'didit', delivery, failedResult);
    expect(db.tables.tutor_verification_v2[0].identity_status).toBe('retryable_failure');
    expect(notices(db)).toHaveLength(0);
  });

  it('a revoke and a reverification request write no notice either', async () => {
    const a = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    await revokeV2(ctx(a), T, 'reason');
    expect(notices(a)).toHaveLength(0);
    const b = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    await requireReverification(ctx(b), { tutorIds: [T], dryRun: false });
    expect(notices(b)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------
describe('a notice that cannot be written', () => {
  it('never undoes a decision, and says so', async () => {
    const db = seed();
    db.failOn.insertTables = ['notifications'];
    const r: any = await approveV2(ctx(db), T);
    expect(r.ok).toBe(true);
    expect(r.notification).toBe('failed');
    expect(db.tables.profiles[0].tutor_verification_status).toBe('VERIFIED');
    expect(db.tables.tutor_verification_v2[0].status).toBe('VERIFIED');
    expect(db.tables.tutor_verification_v2_decisions).toHaveLength(1);
  });

  it('rejecting and revoking keep their decisions too', async () => {
    const a = seed();
    a.failOn.insertTables = ['notifications'];
    expect(((await rejectV2(ctx(a), T, 'some reason')) as any).ok).toBe(true);
    expect(a.tables.tutor_verification_v2[0].status).toBe('REJECTED');
    const b = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    b.failOn.insertTables = ['notifications'];
    expect(((await revokeV2(ctx(b), T, 'x reason')) as any).ok).toBe(true);
    expect(b.tables.profiles[0].tutor_verification_status).toBe('REVOKED');
  });

  it('reverification counts the failures and still changes every teacher', async () => {
    const db = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    db.failOn.insertTables = ['notifications'];
    const r: any = await requireReverification(ctx(db), { tutorIds: [T], dryRun: false });
    expect(r.changed).toBe(1);
    expect(r.notificationsFailed).toBe(1);
    expect(db.tables.profiles[0].tutor_verification_status).toBe('REVERIFICATION_REQUIRED');
  });

  it('submitting still submits', async () => {
    const db = seed({ v2: 'IN_PROGRESS' });
    h.db = db;
    db.failOn.insertTables = ['notifications'];
    expect((await submitPOST()).status).toBe(200);
    expect(db.tables.tutor_verification_v2[0].status).toBe('IN_REVIEW');
  });

  it('is logged with the kind and an error code only: no reason text, no ids, no secrets', async () => {
    const db = seed();
    db.failOn.insertTables = ['notifications'];
    await rejectV2(ctx(db), T, 'PRIVATE reason text 4455');
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain('could not write the notice');
    expect(logged).not.toContain('PRIVATE');
    expect(logged).not.toContain('4455');
    expect(logged).not.toContain('"t1"');
    expect(logged).not.toMatch(/simulated database failure/);
  });

  it('a webhook whose notice fails returns an error so the provider re-delivers; the retry writes the notice once', async () => {
    const db = inProgressCheck();

    db.failOn.insertTables = ['notifications'];
    await expect(applyProviderOutcome(db as any, 'didit', delivery, failedResult)).rejects.toThrow(/notice could not be written/);
    // The status change was kept.
    expect(db.tables.tutor_verification_v2[0].identity_status).toBe('retryable_failure');
    expect(notices(db)).toHaveLength(0);

    // The provider re-delivers; the database is back.
    db.failOn.insertTables = [];
    expect(await applyProviderOutcome(db as any, 'didit', delivery, failedResult)).toBe('applied');
    expect(notices(db)).toHaveLength(1);
    // A third delivery adds nothing.
    await applyProviderOutcome(db as any, 'didit', delivery, failedResult);
    expect(notices(db)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------
describe('a revoke or a reverification request takes the badge away', () => {
  const badges = async (db: any) => Object.keys(await loadPublicSummaries(db, [T]));

  it('verified -> badge shows; revoked -> badge gone, and the teacher is told', async () => {
    const db = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    expect(await badges(db)).toEqual([T]);
    await revokeV2(ctx(db), T, 'No longer eligible');
    expect(await badges(db)).toEqual([]);
    expect(db.tables.tutor_verified_subjects[0].is_public).toBe(false);
    expect(notices(db).map((n: any) => n.type)).toEqual(['VERIFICATION_REVOKED']);
  });

  it('reverification required -> badge gone, and the teacher is told', async () => {
    const db = seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    expect(await badges(db)).toEqual([T]);
    await requireReverification(ctx(db), { tutorIds: [T], dryRun: false });
    expect(await badges(db)).toEqual([]);
    expect(notices(db).map((n: any) => n.type)).toEqual(['VERIFICATION_REVERIFICATION_REQUIRED']);
  });

  it('approval -> badge appears', async () => {
    const db = seed();
    expect(await badges(db)).toEqual([]);
    await approveV2(ctx(db), T);
    expect(await badges(db)).toEqual([T]);
  });
});

// ---------------------------------------------------------------
describe('the status page and the badge cache refresh by themselves', () => {
  const dto = (over: Partial<VerificationV2StateDto> = {}): VerificationV2StateDto => ({
    status: 'IN_REVIEW',
    consentAt: 'x',
    identity: { status: 'verified', reason: null, country: 'TT', attempts: 1, maxAttempts: 3, canRetry: false, furtherRoute: false, countries: [], available: true },
    submittedAt: 'a',
    decisionReason: null,
    reference: null,
    editable: false,
    step: 4,
    credentials: [],
    extras: [],
    ...over,
  });

  it('polls while in review (5 s) or in progress (8 s), and only then', () => {
    expect(pollIntervalMs('IN_REVIEW')).toBe(5000);
    expect(pollIntervalMs('IN_PROGRESS')).toBe(8000);
    for (const s of ['VERIFIED', 'REJECTED', 'REVOKED', 'REVERIFICATION_REQUIRED', 'NOT_STARTED'] as const) {
      expect(shouldPoll(s)).toBe(false);
    }
    expect(shouldPoll(null)).toBe(false);
  });

  it('applies a poll result only when something the teacher sees changed', () => {
    expect(stateSignature(dto())).toBe(stateSignature(dto()));
    expect(stateSignature(dto())).not.toBe(stateSignature(dto({ status: 'VERIFIED' })));
    expect(stateSignature(dto())).not.toBe(stateSignature(dto({ decisionReason: 'because' })));
    const failed = dto({ identity: { ...dto().identity, status: 'retryable_failure', reason: 'abandoned' } });
    expect(stateSignature(dto())).not.toBe(stateSignature(failed));
  });

  it('the public badge answer is good for a minute, then asked for again', () => {
    expect(SUMMARY_TTL_MS).toBe(60_000);
    expect(isSummaryFresh(undefined, 1000)).toBe(false);
    expect(isSummaryFresh({ at: 1000 }, 1000 + 59_999)).toBe(true);
    expect(isSummaryFresh({ at: 1000 }, 1000 + 60_000)).toBe(false);
  });
});
