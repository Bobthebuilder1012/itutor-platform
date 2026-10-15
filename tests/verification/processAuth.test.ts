import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({
  session: { user: null as any, profile: null as any },
  service: null as any,
  ocrThrows: false,
}));

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () =>
        h.session.user
          ? { data: { user: h.session.user }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.session.profile, error: null }) }) }),
    }),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.service }));
vi.mock('@/lib/ocr/ocrProvider', () => ({
  ocrProvider: {
    processDocument: async () => {
      if (h.ocrThrows) throw new Error('ocr exploded: secret internals');
      return { extractedText: 'PRIVATE DOCUMENT TEXT', extractedJson: { candidate: 'x' }, confidenceScore: 80 };
    },
    generateRecommendation: () => ({ recommendation: null, reason: 'needs a manual review' }),
  },
}));

import { POST } from '@/app/api/verification/request/[id]/process/route';
import { decideProcessAccess } from '@/lib/verification/processAuth';

const REQ = 'req-1';

function seed(profileStatus = 'UNVERIFIED') {
  h.service = makeFakeDb({
    tutor_verification_requests: [
      { id: REQ, tutor_id: 'tutor-A', status: 'SUBMITTED', file_path: 'tutor-A/req-1/f.pdf', file_type: 'pdf' },
    ],
    profiles: [{ id: 'tutor-A', tutor_verification_status: profileStatus, full_name: 'A', display_name: 'A' }],
    tutor_verification_events: [],
  });
}

function call(headers: Record<string, string> = {}) {
  return POST(
    new NextRequest(`http://localhost/api/verification/request/${REQ}/process`, { method: 'POST', headers }),
    { params: { id: REQ } }
  );
}

const request = () => h.service.tables.tutor_verification_requests[0];
const profile = () => h.service.tables.profiles[0];

beforeEach(() => {
  h.session = { user: null, profile: null };
  h.ocrThrows = false;
  process.env.VERIFICATION_PROCESS_SECRET = 's3cret-value';
  seed();
});

describe('POST /api/verification/request/[id]/process: authentication', () => {
  it('401 with no session and no secret, and touches nothing', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(h.service.calls).toHaveLength(0);
    expect(request().status).toBe('SUBMITTED');
  });

  it('401 with a wrong secret', async () => {
    const res = await call({ authorization: 'Bearer not-the-secret' });
    expect(res.status).toBe(401);
    expect(h.service.calls).toHaveLength(0);
  });

  it('401 with a malformed authorization header', async () => {
    expect((await call({ authorization: 's3cret-value' })).status).toBe(401);
  });

  it('401 when no secret is configured, even for an empty bearer', async () => {
    delete process.env.VERIFICATION_PROCESS_SECRET;
    expect((await call({ authorization: 'Bearer ' })).status).toBe(401);
  });

  it('accepts the server secret', async () => {
    const res = await call({ authorization: 'Bearer s3cret-value' });
    expect(res.status).toBe(200);
    expect(request().status).toBe('READY_FOR_REVIEW');
  });
});

describe('POST /api/verification/request/[id]/process: authorisation', () => {
  it('403 for a DIFFERENT tutor, and the request is untouched', async () => {
    h.session = { user: { id: 'tutor-B' }, profile: { role: 'tutor', is_reviewer: false } };
    const res = await call();
    expect(res.status).toBe(403);
    expect(request().status).toBe('SUBMITTED');
    expect(h.service.calls.some((c: any) => c.op === 'update')).toBe(false);
  });

  it('403 for a student', async () => {
    h.session = { user: { id: 'tutor-A' }, profile: { role: 'student', is_reviewer: false } };
    expect((await call()).status).toBe(403);
    expect(request().status).toBe('SUBMITTED');
  });

  it('accepts the tutor who owns the request', async () => {
    h.session = { user: { id: 'tutor-A' }, profile: { role: 'tutor', is_reviewer: false } };
    const res = await call();
    expect(res.status).toBe(200);
    expect(request().status).toBe('READY_FOR_REVIEW');
  });

  it('accepts a reviewer and an admin', async () => {
    h.session = { user: { id: 'rev' }, profile: { role: 'student', is_reviewer: true } };
    expect((await call()).status).toBe(200);

    seed();
    h.session = { user: { id: 'adm' }, profile: { role: 'admin', is_reviewer: false } };
    expect((await call()).status).toBe(200);
  });

  it('404 for an unknown request, but only after authentication', async () => {
    h.service.tables.tutor_verification_requests = [];
    expect((await call()).status).toBe(401);
    h.session = { user: { id: 'rev' }, profile: { role: 'admin', is_reviewer: true } };
    expect((await call()).status).toBe(404);
  });
});

describe('POST /api/verification/request/[id]/process: what it returns and does', () => {
  it('does not return OCR text or extracted fields', async () => {
    const res = await call({ authorization: 'Bearer s3cret-value' });
    const text = await res.text();
    expect(text).not.toContain('PRIVATE DOCUMENT TEXT');
    expect(text).not.toContain('candidate');
    expect(JSON.parse(text)).toMatchObject({ success: true, status: 'READY_FOR_REVIEW' });
  });

  it('does not leak error details when processing fails, and resets the request', async () => {
    // The upload flow sets the profile to PENDING before it calls this endpoint.
    seed('PENDING');
    h.ocrThrows = true;
    const res = await call({ authorization: 'Bearer s3cret-value' });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('secret internals');
    expect(JSON.parse(text)).toEqual({ error: 'Processing failed' });
    expect(request().status).toBe('SUBMITTED');
    // the profile is put back too, not left stuck in PROCESSING
    expect(profile().tutor_verification_status).toBe('PENDING');
  });

  it('does not drag a VERIFIED teacher back to processing', async () => {
    seed('VERIFIED');
    await call({ authorization: 'Bearer s3cret-value' });
    expect(profile().tutor_verification_status).toBe('VERIFIED');
  });

  it('does not move a REVOKED teacher', async () => {
    seed('REVOKED');
    await call({ authorization: 'Bearer s3cret-value' });
    expect(profile().tutor_verification_status).toBe('REVOKED');
  });

  it('refuses a request that is not SUBMITTED', async () => {
    request().status = 'APPROVED';
    const res = await call({ authorization: 'Bearer s3cret-value' });
    expect(res.status).toBe(400);
    expect(request().status).toBe('APPROVED');
  });
});

describe('decideProcessAccess (pure)', () => {
  const owner = { user: { id: 'u1' }, profile: { role: 'tutor', is_reviewer: false } };

  it('secret wins', () => {
    expect(decideProcessAccess({ secretMatched: true, user: null, profile: null }, 'x')).toMatchObject({
      allowed: true, via: 'secret',
    });
  });

  it('unauthenticated is 401', () => {
    expect(decideProcessAccess({ secretMatched: false, user: null, profile: null }, 'u1')).toMatchObject({
      allowed: false, status: 401,
    });
  });

  it('owner tutor is allowed, any other tutor is 403', () => {
    expect(decideProcessAccess({ secretMatched: false, ...owner }, 'u1')).toMatchObject({ allowed: true, via: 'owner' });
    expect(decideProcessAccess({ secretMatched: false, ...owner }, 'u2')).toMatchObject({ allowed: false, status: 403 });
  });

  it('a request with no owner can never be matched by a tutor', () => {
    expect(decideProcessAccess({ secretMatched: false, ...owner }, null)).toMatchObject({ allowed: false, status: 403 });
  });

  it('staff are allowed and recorded as admin or reviewer', () => {
    expect(
      decideProcessAccess({ secretMatched: false, user: { id: 'a' }, profile: { role: 'admin', is_reviewer: false } }, 'u1')
    ).toMatchObject({ allowed: true, via: 'staff', actor: 'admin' });
    expect(
      decideProcessAccess({ secretMatched: false, user: { id: 'r' }, profile: { role: 'student', is_reviewer: true } }, 'u1')
    ).toMatchObject({ allowed: true, via: 'staff', actor: 'reviewer' });
  });

  it('a user with no profile is 403, not allowed', () => {
    expect(decideProcessAccess({ secretMatched: false, user: { id: 'x' }, profile: null }, 'u1')).toMatchObject({
      allowed: false, status: 403,
    });
  });
});
