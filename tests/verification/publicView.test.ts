import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.db }));

import { loadPublicDetail, loadPublicSummaries } from '@/lib/verificationV2/publicView';
import { GET as summaryGET } from '@/app/api/public/verification-v2/summary/route';
import { GET as detailGET } from '@/app/api/public/verification-v2/[tutorId]/route';
import { GET as flagGET } from '@/app/api/verification-v2/flag/route';
import { LABEL_CREDENTIALS, LABEL_EXTRAS, LABEL_ID } from '@/components/verification/VerificationBadges';

function seed() {
  const v2 = (id: string, status: string, identity = 'verified') => ({
    tutor_id: id, status, identity_status: identity, decided_at: '2026-02-01T00:00:00.000Z',
  });
  h.db = makeFakeDb({
    profiles: [
      { id: 'ok', tutor_verification_status: 'VERIFIED' },
      { id: 'noid', tutor_verification_status: 'VERIFIED' },
      { id: 'review', tutor_verification_status: 'PENDING' },
      { id: 'revoked', tutor_verification_status: 'REVOKED' },
      { id: 'reverify', tutor_verification_status: 'REVERIFICATION_REQUIRED' },
      { id: 'rejected', tutor_verification_status: 'REJECTED' },
      { id: 'mismatch', tutor_verification_status: 'PENDING' }, // v2 says VERIFIED, profile does not
    ],
    tutor_verification_v2: [
      v2('ok', 'VERIFIED'), v2('noid', 'VERIFIED', 'pending'), v2('review', 'IN_REVIEW'), v2('revoked', 'REVOKED'),
      v2('reverify', 'REVERIFICATION_REQUIRED'), v2('rejected', 'REJECTED'), v2('mismatch', 'VERIFIED'),
    ],
    tutor_credentials_v2: [
      { tutor_id: 'ok', kind: 'CSEC', subject: 'Maths', grade: 'I', exam_year: 2020, school: null, degree: null, field: null,
        graduation_year: null, proof_path: 'ok/SECRET.pdf', proof_url: 'https://secret-proof.example', proof_filename: 'secret.pdf', created_at: '1' },
      { tutor_id: 'review', kind: 'CSEC', subject: 'Hidden', grade: 'I', exam_year: 2020, created_at: '1' },
    ],
    tutor_extras_v2: [
      { tutor_id: 'ok', title: 'E1', description: 'd1', link_url: 'https://e1.example', created_at: '1' },
      { tutor_id: 'ok', title: 'E2', description: 'd2', link_url: null, created_at: '2' },
      { tutor_id: 'ok', title: 'E3', description: 'd3', link_url: null, created_at: '3' },
      { tutor_id: 'ok', title: 'E4-should-never-show', description: 'd4', link_url: null, created_at: '4' },
      { tutor_id: 'review', title: 'Hidden extra', description: 'x', link_url: null, created_at: '1' },
    ],
  });
}

const req = (path: string) => new NextRequest(`http://localhost${path}`);

beforeEach(() => {
  process.env.VERIFICATION_V2_ENABLED = 'true';
  seed();
});

describe('the three labels', () => {
  it('are the exact, separate wordings', () => {
    expect(LABEL_ID).toBe('ID checked');
    expect(LABEL_CREDENTIALS).toBe('Credentials reviewed');
    expect(LABEL_EXTRAS).toBe('Teacher-provided extras (not verified by iTutor)');
  });
});

describe('loadPublicSummaries', () => {
  it('returns only teachers verified in BOTH records', async () => {
    const s = await loadPublicSummaries(h.db, ['ok', 'noid', 'review', 'revoked', 'reverify', 'rejected', 'mismatch', 'nobody']);
    expect(Object.keys(s).sort()).toEqual(['noid', 'ok']);
  });

  it('keeps the three facts separate', async () => {
    const s = await loadPublicSummaries(h.db, ['ok', 'noid']);
    expect(s.ok).toEqual({ idChecked: true, credentialsReviewed: true, hasExtras: true });
    expect(s.noid).toEqual({ idChecked: false, credentialsReviewed: true, hasExtras: false });
  });

  it('a teacher who is in review, revoked or asked to reverify looks like one who never applied', async () => {
    for (const id of ['review', 'revoked', 'reverify', 'rejected', 'mismatch']) {
      expect(await loadPublicSummaries(h.db, [id])).toEqual({});
    }
  });

  it('ignores malformed ids and caps the batch', async () => {
    expect(await loadPublicSummaries(h.db, ["ok'; drop table x;--", '', '../etc'])).toEqual({});
    const many = Array.from({ length: 80 }, (_, i) => `id${i}`);
    await expect(loadPublicSummaries(h.db, many)).resolves.toEqual({});
  });
});

describe('loadPublicDetail', () => {
  it('returns the verified date, credentials and AT MOST 3 extras', async () => {
    const d = await loadPublicDetail(h.db, 'ok');
    expect(d).toMatchObject({ idChecked: true, credentialsReviewed: true, hasExtras: true, verifiedAt: '2026-02-01T00:00:00.000Z' });
    expect(d!.credentials).toEqual([
      { kind: 'CSEC', subject: 'Maths', grade: 'I', examYear: 2020, school: null, degree: null, field: null, graduationYear: null },
    ]);
    expect(d!.extras.map((e) => e.title)).toEqual(['E1', 'E2', 'E3']);
  });

  it('never exposes proof files, paths, links or filenames', async () => {
    const text = JSON.stringify(await loadPublicDetail(h.db, 'ok'));
    expect(text).not.toMatch(/SECRET|secret-proof|proof_|proofPath|proofUrl|filename|\.pdf/i);
  });

  it('is null for every teacher who is not verified', async () => {
    for (const id of ['review', 'revoked', 'reverify', 'rejected', 'mismatch', 'nobody', 'x; drop']) {
      expect(await loadPublicDetail(h.db, id)).toBeNull();
    }
  });
});

describe('public routes', () => {
  it('404 when VERIFICATION_V2_ENABLED is off, without touching the database', async () => {
    process.env.VERIFICATION_V2_ENABLED = 'false';
    expect((await summaryGET(req('/api/public/verification-v2/summary?ids=ok'))).status).toBe(404);
    expect((await detailGET(req('/x'), { params: { tutorId: 'ok' } })).status).toBe(404);
    expect(h.db.calls).toHaveLength(0);
  });

  it('the summary is public (no auth) and lists only verified teachers', async () => {
    const res = await summaryGET(req('/api/public/verification-v2/summary?ids=ok,review,revoked'));
    expect(res.status).toBe(200);
    expect(Object.keys((await res.json()).summaries)).toEqual(['ok']);
  });

  it('the summary refuses more than 50 ids', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `a${i}`).join(',');
    expect((await summaryGET(req(`/api/public/verification-v2/summary?ids=${ids}`))).status).toBe(400);
  });

  it('the detail is 404 for a teacher who is not verified, 200 for one who is', async () => {
    expect((await detailGET(req('/x'), { params: { tutorId: 'review' } })).status).toBe(404);
    expect((await detailGET(req('/x'), { params: { tutorId: 'revoked' } })).status).toBe(404);
    const ok = await detailGET(req('/x'), { params: { tutorId: 'ok' } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
  });

  it('the flag endpoint reports only a boolean', async () => {
    expect(await (await flagGET()).json()).toEqual({ enabled: true });
    process.env.VERIFICATION_V2_ENABLED = 'false';
    expect(await (await flagGET()).json()).toEqual({ enabled: false });
  });
});
