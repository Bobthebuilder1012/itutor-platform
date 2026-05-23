import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: vi.fn(),
}));

import { getServiceClient } from '@/lib/supabase/server';

function makeReq(secret = 'test-cron-secret') {
  return new NextRequest('http://localhost', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });
}

// -------------------------------------------------------
// POST /api/cron/expire-rating-prompts
// -------------------------------------------------------
describe('POST /api/cron/expire-rating-prompts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 with wrong secret', async () => {
    const { POST } = await import('@/app/api/cron/expire-rating-prompts/route');
    const res = await POST(makeReq('wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('expires pending prompts and returns count', async () => {
    const expired = [{ id: 'p1' }, { id: 'p2' }];
    (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: (_t: string) => {
        const chain: Record<string, unknown> = {};
        chain.update = () => chain;
        chain.eq = () => chain;
        chain.lt = () => chain;
        chain.select = () => Promise.resolve({ data: expired, error: null });
        return chain;
      },
    });
    const { POST } = await import('@/app/api/cron/expire-rating-prompts/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.expired).toBe(2);
  });
});

// -------------------------------------------------------
// POST /api/cron/generate-rating-prompts
// -------------------------------------------------------
describe('POST /api/cron/generate-rating-prompts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 with wrong secret', async () => {
    const { POST } = await import('@/app/api/cron/generate-rating-prompts/route');
    const res = await POST(makeReq('wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('generates prompts for enrolled students and returns 200', async () => {
    const classes = [{ id: 'cls-1', tutor_id: 't1', billing_model: 'per_month' }];
    const enrollments = [{ user_id: 'student-1' }];

    // Build a fully thenable chain that tracks table context for targeted responses
    const responses: Record<string, unknown>[] = [
      { data: classes, error: null },      // groups query (is+eq chain)
      { data: enrollments, error: null },  // group_members query
      { count: 0, error: null },           // rating_prompts count
      { error: null },                     // rating_prompts insert
      { data: [], error: null },           // sessions (per-session sweep, empty)
    ];
    let idx = 0;

    function makeChain(): unknown {
      const res = responses[idx++] ?? { data: null, error: null };
      const p = Promise.resolve(res);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = {};
      c.select = () => makeChain();
      c.insert = () => p;
      c.eq = () => c;
      c.is = () => c;
      c.not = () => c;
      c.order = () => c;
      c.single = () => p;
      c.maybeSingle = () => p;
      c.then = p.then.bind(p);
      c.catch = p.catch.bind(p);
      return c;
    }

    (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: (_table: string) => makeChain(),
    });

    const { POST } = await import('@/app/api/cron/generate-rating-prompts/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
  });
});
