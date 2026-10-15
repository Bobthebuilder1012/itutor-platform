import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({ service: null as any, admin: { id: 'adm-1', role: 'admin' } as any }));

vi.mock('@/lib/middleware/adminAuth', () => ({
  requireAdmin: async () => ({ error: null, user: { id: h.admin.id }, profile: h.admin }),
}));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.service }));

import { POST } from '@/app/api/admin/verification/requests/[id]/reject/route';

const VERIFIED_AT = '2026-03-01T10:00:00.000Z';

function seed(requestStatus: string) {
  h.service = makeFakeDb({
    profiles: [
      { id: 'tutor-A', tutor_verification_status: 'VERIFIED', tutor_verified_at: VERIFIED_AT },
    ],
    tutor_verification_requests: [
      { id: 'req-pending', tutor_id: 'tutor-A', status: requestStatus },
    ],
    tutor_verified_subjects: [
      { id: 's1', tutor_id: 'tutor-A', is_public: true },
      { id: 's2', tutor_id: 'tutor-A', is_public: true },
    ],
    notifications: [],
  });
}

function reject(reason = 'The scan is unreadable') {
  return POST(
    new NextRequest('http://localhost/api/admin/verification/requests/req-pending/reject', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
    { params: { id: 'req-pending' } }
  );
}

const profile = () => h.service.tables.profiles[0];
const request = () => h.service.tables.tutor_verification_requests[0];

beforeEach(() => {
  h.admin = { id: 'adm-1', role: 'admin' };
});

describe('admin rejects one pending document of a VERIFIED teacher', () => {
  for (const status of ['SUBMITTED', 'PROCESSING', 'READY_FOR_REVIEW']) {
    it(`rejects the ${status} request and leaves the teacher exactly as verified as before`, async () => {
      seed(status);
      const res = await reject();
      const body = await res.json();

      expect(res.status).toBe(200);
      // the document is rejected, with the decision recorded
      expect(request()).toMatchObject({
        status: 'REJECTED',
        reviewer_decision: 'REJECT',
        reviewer_reason: 'The scan is unreadable',
        reviewed_by: 'adm-1',
      });
      // the teacher is untouched: still VERIFIED, same verified date
      expect(profile().tutor_verification_status).toBe('VERIFIED');
      expect(profile().tutor_verified_at).toBe(VERIFIED_AT);
      // their public verified subjects stay public (this used to hide them)
      expect(h.service.tables.tutor_verified_subjects.every((s: any) => s.is_public === true)).toBe(true);
      // and the response says so, instead of implying a revoke
      expect(body.teacher_status_unchanged).toMatch(/stays verified/i);
    });
  }

  it('never writes to the profile row at all', async () => {
    seed('READY_FOR_REVIEW');
    await reject();
    const profileWrites = h.service.calls.filter((c: any) => c.table === 'profiles' && c.op !== 'select');
    expect(profileWrites).toEqual([]);
  });

  it('works the same when the rejecting admin is a reviewer-role account', async () => {
    h.admin = { id: 'rev-1', role: 'student', is_reviewer: true };
    seed('READY_FOR_REVIEW');
    expect((await reject()).status).toBe(200);
    expect(profile().tutor_verification_status).toBe('VERIFIED');
  });
});

describe('admin rejects an already-APPROVED request', () => {
  it('returns 409 "use revoke" and changes nothing', async () => {
    seed('APPROVED');
    const res = await reject();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('use_revoke');
    expect(body.error).toMatch(/revoke/i);
    expect(request().status).toBe('APPROVED');
    expect(profile().tutor_verification_status).toBe('VERIFIED');
    expect(profile().tutor_verified_at).toBe(VERIFIED_AT);
    expect(h.service.tables.notifications).toHaveLength(0);
    expect(h.service.calls.some((c: any) => c.op === 'update')).toBe(false);
  });
});

describe('admin reject still rejects an unverified teacher normally', () => {
  it('moves a PENDING teacher to REJECTED', async () => {
    seed('READY_FOR_REVIEW');
    profile().tutor_verification_status = 'PENDING';
    profile().tutor_verified_at = null;
    const res = await reject();
    expect(res.status).toBe(200);
    expect(profile().tutor_verification_status).toBe('REJECTED');
  });

  it('requires a reason', async () => {
    seed('READY_FOR_REVIEW');
    expect((await reject('   ')).status).toBe(400);
    expect(request().status).toBe('READY_FOR_REVIEW');
  });
});
