import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: vi.fn(),
  getServerClient: vi.fn(),
}));

import { getServiceClient, getServerClient } from '@/lib/supabase/server';

function mockAuthUser(userId: string | null) {
  (getServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: userId ? { id: userId } : null },
          error: userId ? null : new Error('No session'),
        }),
    },
  });
}

function mockServiceDb(calls: Array<Record<string, unknown>>) {
  let i = 0;
  (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: (_t: string) => {
      const result = calls[i++] ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.insert = () => chain;
      chain.update = () => chain;
      chain.delete = () => chain;
      chain.eq = () => chain;
      chain.order = () => Promise.resolve(result);
      chain.single = () => Promise.resolve(result);
      chain.maybeSingle = () => Promise.resolve(result);
      return chain;
    },
  });
}

// -------------------------------------------------------
// GET /api/admin/moderation/queue
// -------------------------------------------------------
describe('GET /api/admin/moderation/queue', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockAuthUser(null);
    const { GET } = await import('@/app/api/admin/moderation/queue/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockAuthUser('student-1');
    mockServiceDb([{ data: { role: 'student' }, error: null }]);
    const { GET } = await import('@/app/api/admin/moderation/queue/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns reports for admin users', async () => {
    mockAuthUser('admin-1');
    const reports = [{ id: 'rpt1', status: 'pending' }];
    mockServiceDb([
      { data: { role: 'admin' }, error: null },
      { data: reports, error: null },
    ]);
    const { GET } = await import('@/app/api/admin/moderation/queue/route');
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

// -------------------------------------------------------
// POST /api/admin/moderation/[reportId]/resolve
// -------------------------------------------------------
describe('POST /api/admin/moderation/[reportId]/resolve', () => {
  beforeEach(() => vi.resetAllMocks());

  function makeReq(body: unknown) {
    return new NextRequest('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when unauthenticated', async () => {
    mockAuthUser(null);
    const { POST } = await import(
      '@/app/api/admin/moderation/[reportId]/resolve/route'
    );
    const res = await POST(makeReq({ action: 'dismiss' }), {
      params: { reportId: 'rpt1' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    mockAuthUser('student-1');
    mockServiceDb([{ data: { role: 'student' }, error: null }]);
    const { POST } = await import(
      '@/app/api/admin/moderation/[reportId]/resolve/route'
    );
    const res = await POST(makeReq({ action: 'dismiss' }), {
      params: { reportId: 'rpt1' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid action', async () => {
    mockAuthUser('admin-1');
    mockServiceDb([{ data: { role: 'admin' }, error: null }]);
    const { POST } = await import(
      '@/app/api/admin/moderation/[reportId]/resolve/route'
    );
    const res = await POST(makeReq({ action: 'explode' }), {
      params: { reportId: 'rpt1' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 when admin dismisses a report', async () => {
    mockAuthUser('admin-1');
    const report = { id: 'rpt1', target_type: 'class_comment', target_id: 'cm1', reply_id: null, status: 'pending' };
    const resolved = { ...report, status: 'dismissed' };
    mockServiceDb([
      { data: { role: 'admin' }, error: null },   // requireAdmin
      { data: report, error: null },               // fetch report
      { data: resolved, error: null },             // update report
    ]);
    const { POST } = await import(
      '@/app/api/admin/moderation/[reportId]/resolve/route'
    );
    const res = await POST(makeReq({ action: 'dismiss' }), {
      params: { reportId: 'rpt1' },
    });
    expect(res.status).toBe(200);
  });
});
