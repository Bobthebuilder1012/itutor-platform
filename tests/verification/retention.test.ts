import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb } from '../helpers/fakeDb';
import { retentionPolicy } from '@/config/verificationRetention';

const h = vi.hoisted(() => ({
  redacted: [] as string[],
  failIds: new Set<string>(),
  stripeThrowsAlways: false,
  db: null as any,
  hang: false,
}));

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.db }));
vi.mock('@/lib/payments/stripeClient', () => ({
  getStripeClient: () => ({
    identity: {
      verificationSessions: {
        redact: async (id: string) => {
          if (h.hang) return new Promise(() => undefined); // never settles
          if (h.stripeThrowsAlways || h.failIds.has(id)) throw new Error('stripe says no');
          h.redacted.push(id);
          return { id };
        },
      },
    },
  }),
}));

import { redactIdentitySessions } from '@/lib/verificationV2/redaction';
import { deleteRequestFile, deleteVerificationFiles } from '@/lib/verificationV2/fileDeletion';
import { runVerificationCleanup } from '@/lib/verificationV2/cleanup';
import { cleanupVerificationDataForAccountDeletion } from '@/lib/verificationV2/accountDeletion';

const T = 't1';
const FILES = () => ({
  'tutor-credential-proofs': [`${T}/p1.pdf`, `${T}/p2.png`, 'other/p3.pdf'],
  'tutor-verifications': [`${T}/requests/r1.pdf`],
  verification_uploads: [`${T}/req-uuid/slip.pdf`, `${T}/req-uuid2/slip2.jpg`],
  'degree-documents': [`${T}/deg1/document.pdf`],
});

function seed(over: Record<string, any[]> = {}, files = FILES()) {
  return makeFakeDb(
    {
      profiles: [{ id: T }],
      tutor_verification_v2: [
        { tutor_id: T, status: 'REJECTED', stripe_identity_session_id: 'vs_b', identity_session_history: ['vs_a', 'vs_b'],
          identity_redacted_at: null, files_deleted_at: null, decided_at: '2026-01-01T00:00:00.000Z' },
      ],
      tutor_credentials_v2: [
        { id: 'c1', tutor_id: T, proof_path: `${T}/p1.pdf`, proof_filename: 'p1.pdf', proof_deleted_at: null },
        { id: 'c2', tutor_id: T, proof_path: null, proof_filename: null, proof_deleted_at: null },
      ],
      tutor_verification_requests: [
        { id: 'r1', tutor_id: T, status: 'REJECTED', file_path: `${T}/requests/r1.pdf`, extracted_text: 'NAME ON SLIP', extracted_json: { a: 1 }, reviewed_at: '2026-01-01T00:00:00.000Z' },
        { id: 'r2', tutor_id: T, status: 'APPROVED', file_path: `${T}/req-uuid/slip.pdf`, extracted_text: 'KEEP?', extracted_json: null, reviewed_at: '2026-01-01T00:00:00.000Z' },
      ],
      degrees: [{ id: 'deg1', user_id: T }],
      degree_documents: [{ id: 'dd1', degree_id: 'deg1', file_url: `${T}/deg1/document.pdf` }],
      ...over,
    },
    files
  );
}

beforeEach(() => {
  h.redacted = [];
  h.failIds = new Set();
  h.stripeThrowsAlways = false;
  h.hang = false;
  h.db = seed();
  retentionPolicy.rejectedDays = 30;
  retentionPolicy.revokedDays = 30;
  retentionPolicy.redactStripeSessionAfterDecision = true;
});

describe('redactIdentitySessions', () => {
  it('redacts every session the teacher ever started and records it', async () => {
    const r = await redactIdentitySessions({ tutorId: T, db: h.db });
    expect(r).toMatchObject({ ok: true, redacted: 2 });
    expect(h.redacted.sort()).toEqual(['vs_a', 'vs_b']);
    expect(h.db.tables.tutor_verification_v2[0].identity_redacted_at).toBeTruthy();
  });

  it('does not record success if any session failed, so it can be retried', async () => {
    h.failIds.add('vs_a');
    const r = await redactIdentitySessions({ tutorId: T, db: h.db });
    expect(r).toMatchObject({ ok: false, redacted: 1, failed: 1 });
    expect(h.db.tables.tutor_verification_v2[0].identity_redacted_at).toBeNull();
  });

  it('never throws, even when Stripe is down', async () => {
    h.stripeThrowsAlways = true;
    await expect(redactIdentitySessions({ tutorId: T, db: h.db })).resolves.toMatchObject({ ok: false });
  });

  it('is a no-op once redacted, with no session, or when switched off', async () => {
    h.db.tables.tutor_verification_v2[0].identity_redacted_at = '2026-02-01';
    expect(await redactIdentitySessions({ tutorId: T, db: h.db })).toMatchObject({ ok: true, skipped: 'already_redacted' });

    h.db = seed({ tutor_verification_v2: [{ tutor_id: T, stripe_identity_session_id: null, identity_session_history: [] }] });
    expect(await redactIdentitySessions({ tutorId: T, db: h.db })).toMatchObject({ ok: true, skipped: 'no_session' });

    h.db = seed();
    retentionPolicy.redactStripeSessionAfterDecision = false;
    expect(await redactIdentitySessions({ tutorId: T, db: h.db })).toMatchObject({ ok: true, skipped: 'disabled' });
    expect(h.redacted).toEqual([]);
  });

  it('force overrides the post-decision setting (account deletion)', async () => {
    retentionPolicy.redactStripeSessionAfterDecision = false;
    const r = await redactIdentitySessions({ tutorId: T, db: h.db, force: true });
    expect(r.ok).toBe(true);
    expect(h.redacted).toHaveLength(2);
  });
});

describe('deleteVerificationFiles', () => {
  it("scope 'v2' deletes only the new proof bucket, only this teacher's files", async () => {
    const r = await deleteVerificationFiles({ tutorId: T, scope: 'v2', reason: 'rejection', db: h.db });
    expect(r).toMatchObject({ ok: true, deleted: 2 });
    expect(h.db.files['tutor-credential-proofs']).toEqual(['other/p3.pdf']); // someone else's file untouched
    expect(h.db.files['tutor-verifications']).toHaveLength(1);
    expect(h.db.files['verification_uploads']).toHaveLength(2);
  });

  it("scope 'all' deletes every verification bucket including nested folders", async () => {
    const r = await deleteVerificationFiles({ tutorId: T, scope: 'all', reason: 'revocation', db: h.db });
    expect(r).toMatchObject({ ok: true, deleted: 6 });
    expect(h.db.files['tutor-credential-proofs']).toEqual(['other/p3.pdf']);
    expect(h.db.files['tutor-verifications']).toEqual([]);
    expect(h.db.files['verification_uploads']).toEqual([]);
    expect(h.db.files['degree-documents']).toEqual([]);
  });

  it('then clears the database side: proofs, OCR text, degree documents', async () => {
    await deleteVerificationFiles({ tutorId: T, scope: 'all', reason: 'revocation', db: h.db });
    const c1 = h.db.tables.tutor_credentials_v2[0];
    expect(c1).toMatchObject({ proof_path: null, proof_filename: null });
    expect(c1.proof_deleted_at).toBeTruthy();
    expect(h.db.tables.tutor_verification_v2[0].files_deleted_at).toBeTruthy();
    const reqs = h.db.tables.tutor_verification_requests;
    expect(reqs.every((r: any) => r.file_path === '' && r.extracted_text === null && r.extracted_json === null)).toBe(true);
    expect(h.db.tables.degree_documents).toEqual([]);
  });

  it("scope 'v2' leaves the old-flow rows (approved documents) alone", async () => {
    await deleteVerificationFiles({ tutorId: T, scope: 'v2', reason: 'rejection', db: h.db });
    const r2 = h.db.tables.tutor_verification_requests.find((r: any) => r.id === 'r2');
    expect(r2.file_path).not.toBe('');
    expect(r2.extracted_text).toBe('KEEP?');
  });

  it('does not touch the database if a file could not be deleted, so it can be retried', async () => {
    h.db.failOn.storageRemove = true;
    const r = await deleteVerificationFiles({ tutorId: T, scope: 'all', reason: 'revocation', db: h.db });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(h.db.tables.tutor_credentials_v2[0].proof_path).toBe(`${T}/p1.pdf`);
    expect(h.db.tables.tutor_verification_v2[0].files_deleted_at).toBeNull();
  });

  it('never throws on a listing failure', async () => {
    h.db.failOn.storageList = true;
    await expect(deleteVerificationFiles({ tutorId: T, scope: 'all', reason: 'revocation', db: h.db })).resolves.toMatchObject({ ok: false });
  });

  it('skipRowCleanup deletes files only (account deletion)', async () => {
    await deleteVerificationFiles({ tutorId: T, scope: 'all', reason: 'account_deletion', db: h.db, skipRowCleanup: true });
    expect(h.db.tables.tutor_credentials_v2[0].proof_path).toBe(`${T}/p1.pdf`);
  });

  it('deleteRequestFile removes one request file and its OCR text', async () => {
    const r = await deleteRequestFile({ requestId: 'r1', filePath: `${T}/requests/r1.pdf`, db: h.db });
    expect(r.ok).toBe(true);
    expect(h.db.files['tutor-verifications']).toEqual([]);
    expect(h.db.tables.tutor_verification_requests[0]).toMatchObject({ file_path: '', extracted_text: null });
  });
});

describe('runVerificationCleanup (retention sweep)', () => {
  const NOW = new Date('2026-03-01T00:00:00.000Z');

  it('a dry run reports what is due and deletes nothing', async () => {
    const r = await runVerificationCleanup({ db: h.db, now: NOW });
    expect(r.dryRun).toBe(true);
    expect(r.v2RejectedFiles.due).toBe(1);
    expect(r.oldRejectedRequests.due).toBe(1);
    expect(r.redactions.due).toBe(1);
    expect(h.db.removed).toEqual([]);
    expect(h.redacted).toEqual([]);
  });

  it('apply: deletes rejected v2 files past the period and redacts', async () => {
    const r = await runVerificationCleanup({ db: h.db, now: NOW, dryRun: false });
    expect(r.errors).toEqual([]);
    expect(r.v2RejectedFiles.done).toBe(1);
    expect(h.db.files['tutor-credential-proofs']).toEqual(['other/p3.pdf']);
    expect(r.oldRejectedRequests.done).toBe(1);
    expect(r.redactions.done).toBe(1);
  });

  it('does not delete anything still inside the retention period', async () => {
    const r = await runVerificationCleanup({ db: h.db, now: new Date('2026-01-10T00:00:00.000Z'), dryRun: false });
    expect(r.v2RejectedFiles.due).toBe(0);
    expect(r.oldRejectedRequests.due).toBe(0);
    expect(h.db.files['tutor-credential-proofs']).toHaveLength(3);
  });

  it('honours the configured period (a longer one means nothing is due)', async () => {
    const r = await runVerificationCleanup({ db: h.db, now: NOW, policy: { ...retentionPolicy, rejectedDays: 365 } });
    expect(r.v2RejectedFiles.due).toBe(0);
  });

  it('revoked teachers lose ALL verification files after their period', async () => {
    h.db.tables.tutor_verification_v2[0].status = 'REVOKED';
    const r = await runVerificationCleanup({ db: h.db, now: NOW, dryRun: false });
    expect(r.v2RevokedFiles.done).toBe(1);
    expect(h.db.files['degree-documents']).toEqual([]);
    expect(h.db.files['verification_uploads']).toEqual([]);
  });

  it('retries a redaction that failed earlier, and reports a failure', async () => {
    h.failIds.add('vs_a');
    const r = await runVerificationCleanup({ db: h.db, now: NOW, dryRun: false });
    expect(r.redactions.done).toBe(0);
    expect(r.errors.some((e) => e.startsWith('redact'))).toBe(true);
  });
});

describe('cleanupVerificationDataForAccountDeletion', () => {
  it('redacts Stripe and deletes every verification file', async () => {
    const r = await cleanupVerificationDataForAccountDeletion(T);
    expect(r.ok).toBe(true);
    expect(h.redacted).toHaveLength(2);
    expect(h.db.files['tutor-credential-proofs']).toEqual(['other/p3.pdf']);
    expect(h.db.files['degree-documents']).toEqual([]);
  });

  it('redacts even when the post-decision setting is off', async () => {
    retentionPolicy.redactStripeSessionAfterDecision = false;
    await cleanupVerificationDataForAccountDeletion(T);
    expect(h.redacted).toHaveLength(2);
  });

  it('NEVER throws when Stripe and Storage both fail', async () => {
    h.stripeThrowsAlways = true;
    h.db.failOn.storageList = true;
    h.db.failOn.storageRemove = true;
    const r = await cleanupVerificationDataForAccountDeletion(T);
    expect(r.ok).toBe(false);
    expect(r.details.length).toBeGreaterThan(0);
  });

  it('NEVER throws when the database client itself explodes', async () => {
    h.db = { from: () => { throw new Error('db exploded'); }, storage: { from: () => { throw new Error('storage exploded'); } } };
    await expect(cleanupVerificationDataForAccountDeletion(T)).resolves.toMatchObject({ ok: false });
  });

  it('gives up after the time limit instead of hanging the deletion', async () => {
    h.hang = true;
    const started = Date.now();
    const r = await cleanupVerificationDataForAccountDeletion(T, { timeoutMs: 50 });
    expect(r.timedOut).toBe(true);
    expect(r.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('is harmless for an account that never used verification', async () => {
    h.db = seed({ tutor_verification_v2: [] }, { 'tutor-credential-proofs': [], 'tutor-verifications': [], verification_uploads: [], 'degree-documents': [] });
    const r = await cleanupVerificationDataForAccountDeletion('someone-else');
    expect(r.ok).toBe(true);
    expect(h.redacted).toEqual([]);
  });
});
