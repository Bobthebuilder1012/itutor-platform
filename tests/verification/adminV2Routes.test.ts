import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({
  auth: null as any,
  db: null as any,
}));

vi.mock('@/lib/middleware/adminAuth', () => ({ requireAdmin: async () => h.auth }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.db }));
vi.mock('@/lib/payments/stripeClient', () => ({
  getStripeClient: () => ({ identity: { verificationSessions: { redact: async (id: string) => ({ id }) } } }),
}));

import { GET as queueGET } from '@/app/api/admin/verification-v2/queue/route';
import { GET as detailGET } from '@/app/api/admin/verification-v2/[tutorId]/route';
import { POST as approvePOST } from '@/app/api/admin/verification-v2/[tutorId]/approve/route';
import { POST as rejectPOST } from '@/app/api/admin/verification-v2/[tutorId]/reject/route';
import { POST as revokePOST } from '@/app/api/admin/verification-v2/[tutorId]/revoke/route';
import { POST as reverifyPOST } from '@/app/api/admin/verification-v2/reverify/route';
import { POST as cleanupPOST } from '@/app/api/admin/verification-v2/cleanup/route';
import { GET as cronGET } from '@/app/api/cron/verification-cleanup/route';
import { reviewerPolicy } from '@/config/verificationReview';

const ADMIN = { id: 'adm-1', role: 'admin', is_reviewer: false, email: 'admin@itutor.com' };
const REVIEWER = { id: 'rev-1', role: 'student', is_reviewer: true, email: 'rev@itutor.com' };
const params = { params: { tutorId: 't1' } };

const asAdmin = (profile: any) => (h.auth = { error: null, user: { id: profile.id }, profile });
const json = (body: any) => ({ method: 'POST', body: JSON.stringify(body) });
const req = (path: string, init?: RequestInit) => new NextRequest(`http://localhost${path}`, init as any);

function seed(over: { profile?: string; v2?: string } = {}) {
  h.db = makeFakeDb({
    profiles: [{ id: 't1', role: 'tutor', full_name: 'Tia Tutor', display_name: null, email: 't@x.com', tutor_verification_status: over.profile ?? 'PENDING' }],
    tutor_verification_v2: [
      {
        tutor_id: 't1', status: over.v2 ?? 'IN_REVIEW', consent_at: '2026-01-01', identity_status: 'verified', identity_error_code: null,
        identity_attempts: 1, identity_verified_at: '2026-01-02', submitted_at: '2026-01-03', stripe_identity_session_id: 'vs_SECRET_REF',
        identity_session_history: ['vs_SECRET_REF'], identity_redacted_at: null, files_deleted_at: null, decision_reason: null, decided_at: null,
      },
    ],
    tutor_credentials_v2: [
      { id: 'c1', tutor_id: 't1', kind: 'CSEC', subject: 'Mathematics', grade: 'I', exam_year: 2020, proof_path: 't1/a.pdf', proof_filename: 'a.pdf', proof_url: null, proof_deleted_at: null, created_at: '1' },
    ],
    tutor_extras_v2: [{ id: 'x1', tutor_id: 't1', title: 'Robotics club', description: 'Ran it', link_url: null, created_at: '1' }],
    tutor_verification_v2_decisions: [],
    tutor_verified_subjects: [],
  });
}

beforeEach(() => {
  process.env.VERIFICATION_V2_ENABLED = 'true';
  reviewerPolicy.namedReviewerIds = [];
  reviewerPolicy.namedReviewerEmails = [];
  asAdmin(ADMIN);
  seed();
});

const ALL = [
  ['queue', () => queueGET(req('/api/admin/verification-v2/queue'))],
  ['detail', () => detailGET(req('/x'), params)],
  ['approve', () => approvePOST(req('/x', json({})), params)],
  ['reject', () => rejectPOST(req('/x', json({ reason: 'r' })), params)],
  ['revoke', () => revokePOST(req('/x', json({ reason: 'r' })), params)],
  ['reverify', () => reverifyPOST(req('/x', json({ scope: 'verified' })))],
  ['cleanup', () => cleanupPOST(req('/x', json({})))],
] as const;

describe('every admin v2 route: access control', () => {
  for (const [name, call] of ALL) {
    it(`${name}: 404 when VERIFICATION_V2_ENABLED is off, and touches nothing`, async () => {
      process.env.VERIFICATION_V2_ENABLED = 'false';
      const res = await call();
      expect(res.status).toBe(404);
      expect(h.db.calls).toHaveLength(0);
    });

    it(`${name}: 401 when not signed in`, async () => {
      h.auth = { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), user: null, profile: null };
      expect((await call()).status).toBe(401);
      expect(h.db.calls).toHaveLength(0);
    });

    it(`${name}: 403 for a non-admin (requireAdmin refuses)`, async () => {
      h.auth = { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: { id: 'x' }, profile: null };
      expect((await call()).status).toBe(403);
    });
  }

  it('the cron route needs CRON_SECRET and the flag', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect((await cronGET(req('/api/cron/verification-cleanup'))).status).toBe(401);
    expect((await cronGET(req('/x', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
    const ok = await cronGET(req('/x', { headers: { authorization: 'Bearer cron-secret' } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).dryRun).toBe(true); // dry run unless apply=1
    process.env.VERIFICATION_V2_ENABLED = 'false';
    expect(await (await cronGET(req('/x', { headers: { authorization: 'Bearer cron-secret' } }))).json()).toMatchObject({ skipped: expect.any(String) });
  });
});

describe('role rules', () => {
  it('a reviewer can approve and reject', async () => {
    asAdmin(REVIEWER);
    expect((await approvePOST(req('/x', json({})), params)).status).toBe(200);
    seed();
    asAdmin(REVIEWER);
    expect((await rejectPOST(req('/x', json({ reason: 'bad' })), params)).status).toBe(200);
  });

  it('a reviewer who is not an admin cannot revoke, reverify or run cleanup (403)', async () => {
    seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    asAdmin(REVIEWER);
    expect((await revokePOST(req('/x', json({ reason: 'r' })), params)).status).toBe(403);
    expect((await reverifyPOST(req('/x', json({ scope: 'verified', apply: true })))).status).toBe(403);
    expect((await cleanupPOST(req('/x', json({ apply: true })))).status).toBe(403);
    expect(h.db.tables.profiles[0].tutor_verification_status).toBe('VERIFIED');
  });

  it('an admin can revoke', async () => {
    seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    const res = await revokePOST(req('/x', json({ reason: 'fraud' })), params);
    expect(res.status).toBe(200);
    expect(h.db.tables.profiles[0].tutor_verification_status).toBe('REVOKED');
  });

  it('named-reviewer config restricts who can decide, but not who can look', async () => {
    reviewerPolicy.namedReviewerIds = ['someone-else'];
    expect((await approvePOST(req('/x', json({})), params)).status).toBe(403);
    expect(h.db.tables.tutor_verification_v2[0].status).toBe('IN_REVIEW');
    expect((await queueGET(req('/api/admin/verification-v2/queue'))).status).toBe(200);

    reviewerPolicy.namedReviewerIds = [ADMIN.id];
    expect((await approvePOST(req('/x', json({})), params)).status).toBe(200);
  });
});

describe('error mapping', () => {
  it('reject without a reason is 400', async () => {
    const res = await rejectPOST(req('/x', json({ reason: '' })), params);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('reason_required');
  });

  it('approving a revoked teacher is 409 locked_revoked', async () => {
    seed({ profile: 'REVOKED' });
    const res = await approvePOST(req('/x', json({})), params);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('locked_revoked');
  });

  it('unknown teacher is 404', async () => {
    h.db.tables.tutor_verification_v2 = [];
    expect((await detailGET(req('/x'), params)).status).toBe(404);
    expect((await approvePOST(req('/x', json({})), params)).status).toBe(404);
  });

  it('queue rejects an unknown status filter', async () => {
    expect((await queueGET(req('/api/admin/verification-v2/queue?status=DROP_TABLE'))).status).toBe(400);
  });
});

describe('what admins can and cannot see', () => {
  it('the queue lists applications without any Stripe reference', async () => {
    const res = await queueGET(req('/api/admin/verification-v2/queue'));
    const text = await res.text();
    expect(JSON.parse(text).items).toHaveLength(1);
    expect(text).toContain('Tia Tutor');
    expect(text).not.toContain('vs_SECRET_REF');
  });

  it('the detail has credentials, extras, evidence criteria and a short-lived proof link', async () => {
    const res = await detailGET(req('/x'), params);
    const body = await res.json();
    expect(body.credentials[0]).toMatchObject({ kind: 'CSEC', subject: 'Mathematics' });
    expect(body.credentials[0].proofLink).toContain('signed.example');
    expect(body.credentials[0].evidence.length).toBeGreaterThan(0);
    expect(body.extras[0].title).toBe('Robotics club');
    expect(body.application.identity.status).toBe('verified');
  });

  it('never returns an ID image, an ID number, a Stripe session reference or a client secret', async () => {
    const text = await (await detailGET(req('/x'), params)).text();
    expect(text).not.toContain('vs_SECRET_REF');
    expect(text).not.toMatch(/client_secret|id_number|document_number|selfie|verified_outputs|stripe_identity_session_id/i);
    // the only storage path returned is a proof for a CREDENTIAL, as a signed link, never raw
    expect(text).not.toContain('"proof_path"');
  });

  it('the detail includes the decision history after a decision', async () => {
    await rejectPOST(req('/x', json({ reason: 'Unreadable' })), params);
    const body = await (await detailGET(req('/x'), params)).json();
    expect(body.decisions[0]).toMatchObject({ action: 'REJECT', reason: 'Unreadable', actorRole: 'admin' });
  });
});

describe('reverify route', () => {
  it('is a dry run unless apply is true', async () => {
    seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    const res = await reverifyPOST(req('/x', json({ scope: 'verified' })));
    expect(await res.json()).toMatchObject({ dryRun: true, matched: 1, changed: 0 });
    expect(h.db.tables.profiles[0].tutor_verification_status).toBe('VERIFIED');
  });

  it('applies on request', async () => {
    seed({ profile: 'VERIFIED', v2: 'VERIFIED' });
    const res = await reverifyPOST(req('/x', json({ scope: 'verified', apply: true, reason: 'policy change' })));
    expect(await res.json()).toMatchObject({ dryRun: false, changed: 1 });
    expect(h.db.tables.profiles[0].tutor_verification_status).toBe('REVERIFICATION_REQUIRED');
  });

  it('rejects a bad scope', async () => {
    expect((await reverifyPOST(req('/x', json({ scope: 'everyone' })))).status).toBe(400);
  });
});
