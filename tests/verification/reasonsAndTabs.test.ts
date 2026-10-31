import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({ guard: null as any }));
vi.mock('@/lib/verificationV2/adminGuard', async (orig) => ({
  ...(await orig<typeof import('@/lib/verificationV2/adminGuard')>()),
  guardAdminV2: async () => h.guard,
}));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.guard?.db }));
vi.mock('@/lib/payments/stripeClient', () => ({
  getStripeClient: () => ({ identity: { verificationSessions: { redact: async (id: string) => ({ id }) } } }),
}));

import { requestInfoV2, rejectV2 } from '@/lib/verificationV2/review';
import { DECISION_REASONS, auditReason, isDecisionReason } from '@/lib/verificationV2/reasons';
import { GET as queueGET } from '@/app/api/admin/verification-v2/queue/route';
import { POST as rejectPOST } from '@/app/api/admin/verification-v2/[tutorId]/reject/route';
import { POST as requestInfoPOST } from '@/app/api/admin/verification-v2/[tutorId]/request-info/route';
import { buildState } from '@/lib/verificationV2/server';

const params = { params: { tutorId: 't1' } };
const post = (body: unknown) => new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

function seed(status = 'IN_REVIEW') {
  return makeFakeDb({
    profiles: [{ id: 't1', role: 'tutor', tutor_verification_status: 'PENDING', tutor_verified_at: null, full_name: 'T', email: 't@x' }],
    tutor_verification_v2: [{ tutor_id: 't1', status, identity_status: 'verified', consent_at: 'x', stripe_identity_session_id: null, identity_session_history: [], decision_reason: null, decided_at: null, submitted_at: '2026-10-01T00:00:00Z' }],
    tutor_credentials_v2: [], tutor_extras_v2: [], tutor_verification_v2_decisions: [], notifications: [],
  });
}

beforeEach(() => {
  process.env.VERIFICATION_V2_ENABLED = 'true';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { delete process.env.VERIFICATION_V2_ENABLED; vi.restoreAllMocks(); });

describe('the fixed list of reasons', () => {
  it('is exactly the five plain reasons', () => {
    expect([...DECISION_REASONS]).toEqual([
      'ID could not be read',
      'ID details did not match your profile name',
      'Credentials unclear or incomplete',
      'Credentials could not be confirmed',
      'Other',
    ]);
    expect(isDecisionReason('Other')).toBe(true);
    for (const bad of ['fraud suspected', 'DOCUMENT_EXPIRED', '', null, 5]) expect(isDecisionReason(bad)).toBe(false);
    expect(auditReason('Other', ' looks edited ')).toBe('Other (internal note: looks edited)');
    expect(auditReason('Other')).toBe('Other');
  });

  it('the reject and request-info routes refuse anything else with 400 and change nothing', async () => {
    const db = seed();
    h.guard = { error: null, db, actor: 'admin', actorId: 'a1' };
    for (const route of [rejectPOST, requestInfoPOST]) {
      for (const reason of ['fraud signal: face mismatch 0.2', 'DECLINED_BY_PROVIDER', undefined]) {
        const res = await route(post({ reason }), params);
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe('reason_invalid');
      }
    }
    expect(db.tables.tutor_verification_v2[0].status).toBe('IN_REVIEW');
    expect(db.tables.notifications).toHaveLength(0);
  });

  it('the teacher is told only the category; the internal note stays in the admin audit', async () => {
    const db = seed();
    h.guard = { error: null, db, actor: 'admin', actorId: 'a1' };
    const res = await rejectPOST(post({ reason: 'Credentials unclear or incomplete', note: 'scan #2 looks edited' }), params);
    expect(res.status).toBe(200);
    expect(db.tables.tutor_verification_v2[0].decision_reason).toBe('Credentials unclear or incomplete');
    expect(JSON.stringify(db.tables.notifications)).not.toContain('looks edited');
    expect(db.tables.tutor_verification_v2_decisions[0].reason).toContain('looks edited');
    const state = buildState(db.tables.tutor_verification_v2[0] as any, [], [], 'PENDING');
    expect(JSON.stringify(state)).not.toContain('looks edited');
    expect(state.decisionReason).toBe('Credentials unclear or incomplete');
  });
});

describe('ask for more information', () => {
  it('sends an application in review back to the teacher, with the reason, a notice and an audit row', async () => {
    const db = seed();
    const r: any = await requestInfoV2({ actor: 'admin', actorId: 'a1', db: db as any }, 't1', 'Credentials could not be confirmed', 'call the school');
    expect(r.ok).toBe(true);
    expect(r.notification).toBe('sent');
    const row = db.tables.tutor_verification_v2[0];
    expect(row.status).toBe('IN_PROGRESS');
    expect(row.decision_reason).toBe('Credentials could not be confirmed');
    // not a rejection: the teacher's profile status is untouched
    expect(db.tables.profiles[0].tutor_verification_status).toBe('PENDING');
    expect(db.tables.notifications[0]).toMatchObject({ type: 'VERIFICATION_MORE_INFO', link: '/tutor/verification-v2' });
    expect(db.tables.notifications[0].message).toContain('Credentials could not be confirmed');
    expect(db.tables.tutor_verification_v2_decisions[0]).toMatchObject({ action: 'REQUEST_INFO', from_status: 'IN_REVIEW', to_status: 'IN_PROGRESS' });
  });

  it('the teacher sees the reason on an editable application, and sending it again clears it', () => {
    const row: any = { tutor_id: 't1', status: 'IN_PROGRESS', consent_at: 'x', decision_reason: 'Other', identity_status: 'verified', identity_attempts: 1 };
    const s = buildState(row, [], [], 'PENDING');
    expect(s.status).toBe('IN_PROGRESS');
    expect(s.editable).toBe(true);
    expect(s.decisionReason).toBe('Other');
    expect(buildState({ ...row, decision_reason: null }, [], [], 'PENDING').decisionReason).toBeNull();
  });

  it('only an application that is in review can be sent back', async () => {
    for (const status of ['IN_PROGRESS', 'VERIFIED', 'REVOKED']) {
      const db = seed(status);
      const r: any = await requestInfoV2({ actor: 'admin', actorId: 'a1', db: db as any }, 't1', 'Other');
      expect(r.ok, status).toBe(false);
      expect(db.tables.notifications).toHaveLength(0);
    }
  });

  it('a reviewer who is not an admin may do it too, and with the flag off nobody is notified', async () => {
    const db = seed();
    expect(((await requestInfoV2({ actor: 'reviewer', actorId: 'r1', db: db as any }, 't1', 'Other')) as any).ok).toBe(true);
    process.env.VERIFICATION_V2_ENABLED = 'false';
    const db2 = seed();
    const r: any = await requestInfoV2({ actor: 'admin', actorId: 'a1', db: db2 as any }, 't1', 'Other');
    expect(r.ok).toBe(true);
    expect(r.notification).toBe('skipped');
    expect(db2.tables.notifications).toHaveLength(0);
  });

  it('rejectV2 still accepts free text when called directly (the routes are the gate)', async () => {
    const db = seed();
    expect(((await rejectV2({ actor: 'admin', actorId: 'a1', db: db as any }, 't1', 'anything')) as any).ok).toBe(true);
  });
});

describe('the queue tabs', () => {
  const rows = [
    { tutor_id: 'a', status: 'IN_REVIEW', submitted_at: '2026-10-01', decision_reason: null },
    { tutor_id: 'b', status: 'IN_REVIEW', submitted_at: '2026-10-02', decision_reason: null },
    { tutor_id: 'c', status: 'IN_PROGRESS', submitted_at: null, decision_reason: 'Other' }, // asked for more
    { tutor_id: 'd', status: 'IN_PROGRESS', submitted_at: null, decision_reason: null }, // just part-way through the form
    { tutor_id: 'e', status: 'REJECTED', submitted_at: '2026-09-01', decision_reason: 'Other' },
    { tutor_id: 'f', status: 'REVERIFICATION_REQUIRED', submitted_at: null, decision_reason: null },
    { tutor_id: 'g', status: 'VERIFIED', submitted_at: '2026-08-01', decision_reason: null },
    { tutor_id: 'h', status: 'REVOKED', submitted_at: '2026-08-01', decision_reason: 'Other' },
  ];
  const get = async (q: string) => {
    const db = makeFakeDb({ tutor_verification_v2: rows.map((r) => ({ ...r, identity_status: 'verified' })), profiles: [], tutor_credentials_v2: [], tutor_extras_v2: [] });
    h.guard = { error: null, db, actor: 'admin', actorId: 'a1' };
    const res = await queueGET(new NextRequest(`http://localhost/api/admin/verification-v2/queue${q}`));
    return { status: res.status, body: await res.json() };
  };

  it('Needs review, Waiting on teacher and Done hold the right people', async () => {
    const ids = async (tab: string) => (await get(`?tab=${tab}`)).body.items.map((i: any) => i.tutorId).sort();
    expect(await ids('review')).toEqual(['a', 'b']);
    expect(await ids('waiting')).toEqual(['c', 'e', 'f']);
    expect(await ids('done')).toEqual(['g', 'h']);
  });

  it('returns the three counts, and a teacher part-way through the form is in none of them', async () => {
    const { body } = await get('?tab=review');
    expect(body.counts).toEqual({ review: 2, waiting: 3, done: 2 });
  });

  it('an unknown tab is 400, and the old ?status= filter still works', async () => {
    expect((await get('?tab=everything')).status).toBe(400);
    const old = await get('?status=VERIFIED');
    expect(old.status).toBe(200);
    expect(old.body.items.map((i: any) => i.tutorId)).toEqual(['g']);
  });
});
