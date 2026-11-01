import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({ db: null as any, guard: null as any }));

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.db }));
vi.mock('@/lib/payments/stripeClient', () => ({
  getStripeClient: () => ({ identity: { verificationSessions: { redact: async (id: string) => ({ id }) } } }),
}));
vi.mock('@/lib/verificationV2/server', async (orig) => ({
  ...(await orig<typeof import('@/lib/verificationV2/server')>()),
  guardV2: async () => ({ error: null, tutorId: '11111111-1111-1111-1111-111111111111', db: h.db, revoked: false, profileStatus: null }),
}));
vi.mock('@/lib/verificationV2/adminGuard', async (orig) => ({
  ...(await orig<typeof import('@/lib/verificationV2/adminGuard')>()),
  guardAdminV2: async () => h.guard,
}));

import { POST as addCredential, DELETE as removeCredential } from '@/app/api/tutor/verification-v2/credentials/route';
import { POST as addExtra } from '@/app/api/tutor/verification-v2/extras/route';
import { POST as submit } from '@/app/api/tutor/verification-v2/submit/route';
import { GET as queueGET } from '@/app/api/admin/verification-v2/queue/route';
import { approveCredentialV2, rejectCredentialV2 } from '@/lib/verificationV2/review';
import { loadPublicDetail, loadPublicSummaries } from '@/lib/verificationV2/publicView';
import { loadVerificationDetailsPage } from '@/lib/verificationV2/publicDetails';
import { namesMatch, nameMatchExtra } from '@/lib/identity/nameMatch';
import { mapDiditDecision } from '@/lib/identity/mapping';

const T = '11111111-1111-1111-1111-111111111111';
const json = (body: unknown, method = 'POST', url = 'http://localhost/x') =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const ctx = (db: any) => ({ actor: 'admin' as const, actorId: 'adm', db });

function seed(o: { status?: string; profile?: string; creds?: any[]; identity?: string | null; extra?: Record<string, any> } = {}) {
  const status = o.status ?? 'VERIFIED';
  return makeFakeDb({
    profiles: [{ id: T, role: 'tutor', tutor_verification_status: o.profile ?? (status === 'VERIFIED' ? 'VERIFIED' : 'PENDING'), full_name: 'Zoë Ramdhanie', display_name: 'Zoe R' }],
    tutor_verification_v2: [
      { tutor_id: T, status, consent_at: 'x', identity_status: o.identity === undefined ? 'verified' : o.identity, identity_attempts: 1, decided_at: '2026-10-01T00:00:00Z', submitted_at: '2026-09-20T00:00:00Z', decision_reason: null, ...(o.extra ?? {}) },
    ],
    tutor_credentials_v2: o.creds ?? [
      { id: 'approved1', tutor_id: T, kind: 'CSEC', subject: 'Maths', grade: 'I', exam_year: 2019, proof_path: `${T}/a.png`, proof_filename: 'a.png', pending_approval: false, created_at: '1' },
    ],
    tutor_extras_v2: [],
    tutor_verification_v2_decisions: [],
    notifications: [],
  });
}
const csec = { kind: 'CSEC', subject: 'Physics', grade: 'I', examYear: 2020, proofUrl: 'https://example.com/proof' };

beforeEach(() => {
  process.env.VERIFICATION_V2_ENABLED = 'true';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { delete process.env.VERIFICATION_V2_ENABLED; vi.restoreAllMocks(); });

describe('a verified teacher adds and edits', () => {
  it('a new credential is pending approval, and the Verified status and badge stay', async () => {
    const db = seed(); h.db = db;
    const res = await addCredential(json(csec));
    expect(res.status).toBe(201);
    const added = db.tables.tutor_credentials_v2.find((c: any) => c.subject === 'Physics');
    expect(added!.pending_approval).toBe(true);
    expect(db.tables.tutor_verification_v2[0].status).toBe('VERIFIED');
    expect(db.tables.profiles[0].tutor_verification_status).toBe('VERIFIED');
    // and the public view still shows the badge but not the pending credential
    expect(Object.keys(await loadPublicSummaries(db as any, [T]))).toEqual([T]);
    const detail = await loadPublicDetail(db as any, T);
    expect(detail!.credentials.map((c) => c.subject)).toEqual(['Maths']);
  });

  it('before verification a new credential is part of the application, not pending', async () => {
    const db = seed({ status: 'IN_PROGRESS', creds: [] }); h.db = db;
    expect((await addCredential(json(csec))).status).toBe(201);
    expect(db.tables.tutor_credentials_v2[0].pending_approval).toBe(false);
  });

  it('a verified teacher can take back a pending credential but never remove an approved one', async () => {
    const db = seed({ creds: [
      { id: 'approved1', tutor_id: T, kind: 'CSEC', subject: 'Maths', proof_path: null, pending_approval: false },
      { id: 'pending1', tutor_id: T, kind: 'CSEC', subject: 'Biology', proof_path: null, pending_approval: true },
    ] }); h.db = db;
    const del = (id: string) => removeCredential(json({}, 'DELETE', `http://localhost/x?id=${id}`));
    expect((await del('approved1')).status).toBe(409);
    expect((await del('pending1')).status).toBe(200);
    expect(db.tables.tutor_credentials_v2.map((c: any) => c.id)).toEqual(['approved1']);
  });

  it('a verified teacher can add an extra; an application in review is still locked', async () => {
    const db = seed(); h.db = db;
    expect((await addExtra(json({ title: 'Coach', description: 'Robotics club coach' }))).status).toBe(201);
    const locked = seed({ status: 'IN_REVIEW' }); h.db = locked;
    expect((await addExtra(json({ title: 'Coach', description: 'x' }))).status).toBe(409);
    expect((await addCredential(json(csec))).status).toBe(409);
  });

  it('with no identity provider configured, qualifications and submitting are not blocked', async () => {
    for (const k of ['DIDIT_API_KEY', 'STRIPE_SECRET_KEY', 'VERIFF_API_KEY']) vi.stubEnv(k, '');
    const db = seed({ status: 'IN_PROGRESS', identity: null, creds: [] }); h.db = db;
    expect((await addCredential(json(csec))).status).toBe(201);
    expect((await submit()).status).toBe(200);
    expect(db.tables.tutor_verification_v2[0].status).toBe('IN_REVIEW');
    vi.unstubAllEnvs();
  });

  it('with a provider configured, the identity check is still required first', async () => {
    vi.stubEnv('DIDIT_API_KEY', 'k');
    const db = seed({ status: 'IN_PROGRESS', identity: null, creds: [] }); h.db = db;
    const res = await addCredential(json(csec));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('identity_required');
    vi.unstubAllEnvs();
  });
});

describe('an admin decides on a pending credential', () => {
  const pending = () => seed({ creds: [
    { id: 'approved1', tutor_id: T, kind: 'CSEC', subject: 'Maths', proof_path: null, pending_approval: false },
    { id: 'pending1', tutor_id: T, kind: 'CSEC', subject: 'Biology', proof_path: `${T}/p.png`, pending_approval: true },
  ] });

  it('approving makes it public, tells the teacher, audits it, and changes no status', async () => {
    const db = pending();
    const r: any = await approveCredentialV2(ctx(db), T, 'pending1');
    expect(r.ok).toBe(true);
    expect(db.tables.tutor_credentials_v2.find((c: any) => c.id === 'pending1')?.pending_approval).toBe(false);
    expect(db.tables.tutor_verification_v2[0].status).toBe('VERIFIED');
    expect(db.tables.profiles[0].tutor_verification_status).toBe('VERIFIED');
    expect(db.tables.notifications[0]).toMatchObject({ type: 'VERIFICATION_APPROVED', link: '/tutor/verification-v2' });
    expect(db.tables.tutor_verification_v2_decisions[0].action).toBe('APPROVE_CREDENTIAL');
    expect((await loadPublicDetail(db as any, T))!.credentials).toHaveLength(2);
  });

  it('rejecting removes it and its proof file, tells the teacher the plain reason, and the badge stays', async () => {
    const db = pending();
    db.files['tutor-credential-proofs'] = [`${T}/p.png`];
    const r: any = await rejectCredentialV2(ctx(db), T, 'pending1', 'Credentials unclear or incomplete', 'blurry');
    expect(r.ok).toBe(true);
    expect(db.tables.tutor_credentials_v2.map((c: any) => c.id)).toEqual(['approved1']);
    expect(db.removed.map((x) => x.path)).toEqual([`${T}/p.png`]);
    expect(db.tables.tutor_verification_v2[0].status).toBe('VERIFIED');
    expect(db.tables.profiles[0].tutor_verification_status).toBe('VERIFIED');
    expect(Object.keys(await loadPublicSummaries(db as any, [T]))).toEqual([T]);
    expect(db.tables.notifications[0].message).toContain('Credentials unclear or incomplete');
    expect(JSON.stringify(db.tables.notifications)).not.toContain('blurry');
    expect(db.tables.tutor_verification_v2_decisions[0]).toMatchObject({ action: 'REJECT_CREDENTIAL' });
  });

  it('an approved credential, or one that does not exist, cannot be decided again', async () => {
    const db = pending();
    expect(((await approveCredentialV2(ctx(db), T, 'approved1')) as any).ok).toBe(false);
    expect(((await rejectCredentialV2(ctx(db), T, 'approved1', 'Other')) as any).ok).toBe(false);
    expect(((await approveCredentialV2(ctx(db), T, 'nope')) as any).ok).toBe(false);
    expect(db.tables.tutor_credentials_v2).toHaveLength(2);
  });

  it('a verified teacher with a pending credential appears under Needs review, not Done', async () => {
    const db = pending();
    h.guard = { error: null, db, actor: 'admin', actorId: 'adm' };
    const get = async (tab: string) => (await (await queueGET(new NextRequest(`http://localhost/api/admin/verification-v2/queue?tab=${tab}`))).json());
    const review = await get('review');
    expect(review.items.map((i: any) => i.tutorId)).toEqual([T]);
    expect(review.items[0].pendingCredentials).toBe(1);
    expect((await get('done')).items).toHaveLength(0);
    // once decided, they move to Done
    await approveCredentialV2(ctx(db), T, 'pending1');
    expect((await get('review')).items).toHaveLength(0);
    expect((await get('done')).items.map((i: any) => i.tutorId)).toEqual([T]);
  });
});

describe('the public Verification details page', () => {
  const approvedAndPending = [
    { id: 'a', tutor_id: T, kind: 'CSEC', subject: 'Maths', grade: 'I', exam_year: 2019, proof_path: `${T}/a.png`, proof_filename: 'a.png', pending_approval: false, created_at: '1' },
    { id: 'b', tutor_id: T, kind: 'DEGREE', school: 'UWI', degree: 'BSc', graduation_year: 2022, proof_path: `${T}/b.pdf`, proof_filename: 'b.pdf', pending_approval: false, created_at: '2' },
    { id: 'c', tutor_id: T, kind: 'CSEC', subject: 'SECRET-PENDING', grade: 'I', exam_year: 2020, proof_path: `${T}/c.png`, proof_filename: 'c.png', pending_approval: true, created_at: '3' },
  ];

  it('lists the approved credentials with short-lived proof links, and never a pending one', async () => {
    const db = seed({ creds: approvedAndPending });
    const page = await loadVerificationDetailsPage(db as any, T);
    expect(page!.credentials.map((c) => c.subject ?? c.degree)).toEqual(['Maths', 'BSc']);
    expect(page!.credentials[0].proofType).toBe('image');
    expect(page!.credentials[1].proofType).toBe('pdf');
    expect(page!.credentials.every((c) => c.proofLink?.startsWith('https://signed.example/'))).toBe(true);
    expect(JSON.stringify(page)).not.toContain('SECRET-PENDING');
  });

  it('is null (a 404) for every teacher who is not verified: in progress, in review, rejected, revoked, verify-again', async () => {
    for (const [status, profile] of [['IN_PROGRESS', 'PENDING'], ['IN_REVIEW', 'PENDING'], ['REJECTED', 'REJECTED'], ['REVOKED', 'REVOKED'], ['REVERIFICATION_REQUIRED', 'REVERIFICATION_REQUIRED']] as const) {
      const db = seed({ status, profile, creds: approvedAndPending });
      expect(await loadVerificationDetailsPage(db as any, T), status).toBeNull();
    }
    expect(await loadVerificationDetailsPage(seed() as any, 'not-a-teacher')).toBeNull();
  });

  it('is null when the v2 record says verified but the teacher profile does not (both records must agree)', async () => {
    expect(await loadVerificationDetailsPage(seed({ profile: 'PENDING' }) as any, T)).toBeNull();
  });

  it('exposes no ID, selfie, provider data, reason or note: the result has only credential fields', async () => {
    const db = seed({ creds: approvedAndPending, extra: { decision_reason: 'Other', identity_provider: 'didit', identity_provider_session_ref: 'SESSION-REF', identity_name_match: false } });
    const text = JSON.stringify(await loadVerificationDetailsPage(db as any, T));
    for (const leak of ['SESSION-REF', 'didit', 'identity', 'Other', 'name_match', 'decision', 'selfie', 'note']) {
      expect(text.toLowerCase(), leak).not.toContain(leak.toLowerCase());
    }
  });
});

describe('the name on the ID against the profile name', () => {
  it('matches ignoring case, accents, punctuation, order and a middle name', () => {
    expect(namesMatch('Zoë Ramdhanie', 'ZOE RAMDHANIE')).toBe(true);
    expect(namesMatch('Ramdhanie, Zoe', 'Zoë Ramdhanie')).toBe(true);
    expect(namesMatch('Zoe Ann Ramdhanie', 'Zoe Ramdhanie')).toBe(true);
    expect(namesMatch("Aisha O'Neil-Baptiste", 'aisha oneil baptiste')).toBe(true);
  });
  it('does not match a different person, or an empty name', () => {
    expect(namesMatch('Zoe Ramdhanie', 'Mark Ramdhanie')).toBe(false);
    expect(namesMatch('Zoe', 'Zoe Ramdhanie')).toBe(true); // every word of the shorter name is in the longer
    expect(namesMatch('', 'Zoe')).toBe(false);
    expect(namesMatch(null, null)).toBe(false);
  });
  it('writes only a yes or no, never the document name, and nothing when the provider gave none', async () => {
    const db = seed();
    expect(await nameMatchExtra(db as any, T, 'Zoe Ramdhanie')).toEqual({ identity_name_match: true });
    expect(await nameMatchExtra(db as any, T, 'Someone Else')).toEqual({ identity_name_match: false });
    expect(await nameMatchExtra(db as any, T, null)).toBeUndefined();
    expect(JSON.stringify(await nameMatchExtra(db as any, T, 'Someone Else'))).not.toContain('Someone');
  });
  it('is read from the Didit decision (full name, or first and last), for the comparison only', () => {
    const full = mapDiditDecision({ status: 'Approved', id_verifications: [{ status: 'Approved', full_name: 'Zoë Ramdhanie', age: 30 }] }, { minimumAge: 18 });
    expect(full.documentName).toBe('Zoë Ramdhanie');
    const parts = mapDiditDecision({ status: 'Approved', id_verifications: [{ status: 'Approved', first_name: 'Zoe', last_name: 'R', age: 30 }] }, { minimumAge: 18 });
    expect(parts.documentName).toBe('Zoe R');
    expect(mapDiditDecision({ status: 'Declined' }, { minimumAge: 18 }).documentName).toBeNull();
  });
});
