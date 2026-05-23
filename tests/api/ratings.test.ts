import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// -------------------------------------------------------
// Mock Supabase and eligibility helpers
// -------------------------------------------------------
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: vi.fn(),
  getServerClient: vi.fn(),
}));

vi.mock('@/lib/eligibility', () => ({
  canRateClass: vi.fn(),
}));

import { getServiceClient, getServerClient } from '@/lib/supabase/server';
import { canRateClass } from '@/lib/eligibility';

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

function buildDbChain(result: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.select = () => chain;
  chain.insert = () => chain;
  chain.update = () => chain;
  chain.eq = () => chain;
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);
  return chain;
}

function mockServiceDb(calls: Array<Record<string, unknown>>) {
  let i = 0;
  const db: Record<string, unknown> = {};
  db.from = (_t: string) => {
    const result = calls[i++] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.insert = () => chain;
    chain.update = () => chain;
    chain.eq = () => chain;
    chain.is = () => chain;
    chain.gt = () => chain;
    chain.lt = () => chain;
    chain.not = () => chain;
    chain.single = () => Promise.resolve(result);
    chain.maybeSingle = () => Promise.resolve(result);
    return chain;
  };
  (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
}

function makeRequest(body: unknown, url = 'http://localhost/api/ratings/class') {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// -------------------------------------------------------
// POST /api/ratings/class
// -------------------------------------------------------
describe('POST /api/ratings/class', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockAuthUser(null);
    const { POST } = await import('@/app/api/ratings/class/route');
    const res = await POST(makeRequest({ classId: 'c1', billingPeriod: '2026-04', stars: 5 }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when stars are missing', async () => {
    mockAuthUser('user-1');
    const { POST } = await import('@/app/api/ratings/class/route');
    const res = await POST(makeRequest({ classId: 'c1', billingPeriod: '2026-04' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when stars are out of range', async () => {
    mockAuthUser('user-1');
    const { POST } = await import('@/app/api/ratings/class/route');
    const res = await POST(makeRequest({ classId: 'c1', billingPeriod: '2026-04', stars: 6 }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when ineligible', async () => {
    mockAuthUser('user-1');
    (canRateClass as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { POST } = await import('@/app/api/ratings/class/route');
    const res = await POST(makeRequest({ classId: 'c1', billingPeriod: '2026-04', stars: 4 }));
    expect(res.status).toBe(403);
  });

  it('returns 201 with correct body when eligible', async () => {
    mockAuthUser('user-1');
    (canRateClass as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const fakeRating = { id: 'r1', stars: 4, class_id: 'c1' };
    mockServiceDb([
      { data: { tutor_id: 'tutor-1' }, error: null },     // groups lookup
      { data: fakeRating, error: null },                   // insert class_rating
      { data: null, error: null },                         // update rating_prompt
    ]);
    const { POST } = await import('@/app/api/ratings/class/route');
    const res = await POST(makeRequest({ classId: 'c1', billingPeriod: '2026-04', stars: 4 }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('r1');
  });
});

// -------------------------------------------------------
// GET /api/ratings/prompts
// -------------------------------------------------------
describe('GET /api/ratings/prompts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockAuthUser(null);
    const { GET } = await import('@/app/api/ratings/prompts/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns prompts for authenticated student', async () => {
    mockAuthUser('student-1');
    const prompts = [{ id: 'p1', status: 'pending' }];
    const db: Record<string, unknown> = {};
    db.from = () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.gt = () => chain;
      chain.or = () => chain;
      chain.order = () => Promise.resolve({ data: prompts, error: null });
      return chain;
    };
    (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    const { GET } = await import('@/app/api/ratings/prompts/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0].id).toBe('p1');
  });
});
