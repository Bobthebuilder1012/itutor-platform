import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: vi.fn(),
  getServerClient: vi.fn(),
}));

vi.mock('@/lib/api/authHelpers', () => ({
  getAuthenticatedUserId: vi.fn(),
  requireAdmin: vi.fn(),
}));

import { getServiceClient, getServerClient } from '@/lib/supabase/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    order: () => chain,
    range: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: undefined,
    ...overrides,
  };
  return chain;
}

function mockServiceClient(fromImpl: (table: string) => Record<string, unknown>) {
  (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn().mockImplementation(fromImpl),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (getAuthenticatedUserId as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: null, error: new Error('Unauthenticated') });
});

// ─── GET /api/comments/class ────────────────────────────────────────────────

describe('GET /api/comments/class', () => {
  it('returns 400 without classId', async () => {
    const { GET } = await import('@/app/api/comments/class/route');
    const req = new NextRequest('http://localhost/api/comments/class');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns paginated comments without auth (public)', async () => {
    const mockComments = [
      { id: 'c1', class_id: 'cls-1', author_id: 'u1', body: 'Great class', stars: 5, like_count: 2, dislike_count: 0, edited_at: null, hidden_at: null, deleted_at: null, created_at: new Date().toISOString(), author: { id: 'u1', full_name: 'Alice Smith', display_name: null, avatar_url: null } },
    ];

    mockServiceClient((table) => {
      if (table === 'class_comments') {
        return makeChain({
          range: () => Promise.resolve({ data: mockComments, error: null, count: 1 }),
        });
      }
      if (table === 'comment_replies') {
        return makeChain({
          is: () => Promise.resolve({ data: [], error: null }),
        });
      }
      return makeChain();
    });

    const { GET } = await import('@/app/api/comments/class/route');
    const req = new NextRequest('http://localhost/api/comments/class?classId=cls-1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comments).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('applies starFilter when provided', async () => {
    const mockComments = [
      { id: 'c1', class_id: 'cls-1', author_id: 'u1', body: 'Great!', stars: 5, like_count: 0, dislike_count: 0, edited_at: null, hidden_at: null, deleted_at: null, created_at: new Date().toISOString(), author: null },
    ];

    const chainMock = makeChain({
      range: () => Promise.resolve({ data: mockComments, error: null, count: 1 }),
    });
    const eqSpy = vi.fn().mockReturnValue(chainMock);
    (chainMock as Record<string, unknown>).eq = eqSpy;

    mockServiceClient((table) => {
      if (table === 'class_comments') return chainMock;
      return makeChain({ is: () => Promise.resolve({ data: [], error: null }) });
    });

    const { GET } = await import('@/app/api/comments/class/route');
    const req = new NextRequest('http://localhost/api/comments/class?classId=cls-1&starFilter=5');
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/comments/tutor ────────────────────────────────────────────────

describe('GET /api/comments/tutor', () => {
  it('returns 400 without tutorId', async () => {
    const { GET } = await import('@/app/api/comments/tutor/route');
    const req = new NextRequest('http://localhost/api/comments/tutor');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns paginated tutor comments', async () => {
    const mockComments = [
      { id: 't1', tutor_id: 'tut-1', author_id: 'u2', body: 'Excellent!', stars: 5, like_count: 1, dislike_count: 0, edited_at: null, hidden_at: null, deleted_at: null, created_at: new Date().toISOString(), author: { id: 'u2', full_name: 'Bob Brown', display_name: null, avatar_url: null } },
    ];

    mockServiceClient((table) => {
      if (table === 'tutor_profile_comments') {
        return makeChain({ range: () => Promise.resolve({ data: mockComments, error: null, count: 1 }) });
      }
      if (table === 'comment_replies') {
        return makeChain({ is: () => Promise.resolve({ data: [], error: null }) });
      }
      return makeChain();
    });

    const { GET } = await import('@/app/api/comments/tutor/route');
    const req = new NextRequest('http://localhost/api/comments/tutor?tutorId=tut-1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comments).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});

// ─── GET /api/comments/eligibility ─────────────────────────────────────────

describe('GET /api/comments/eligibility', () => {
  it('returns 400 without required params', async () => {
    const { GET } = await import('@/app/api/comments/eligibility/route');
    const req = new NextRequest('http://localhost/api/comments/eligibility');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns canComment=false for unauthenticated user', async () => {
    const { GET } = await import('@/app/api/comments/eligibility/route');
    const req = new NextRequest('http://localhost/api/comments/eligibility?targetType=class&targetId=cls-1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canComment).toBe(false);
    expect(body.canReact).toBe(false);
  });

  it('returns canComment=true for authenticated user with pending prompt', async () => {
    (getAuthenticatedUserId as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'user-1', error: null });

    mockServiceClient((table) => {
      if (table === 'rating_prompts') {
        return makeChain({
          limit: () => Promise.resolve({ data: [{ billing_period: '2026-04', status: 'pending' }], error: null }),
        });
      }
      if (table === 'class_comments') {
        return makeChain({
          is: () => Promise.resolve({ data: [], error: null }),
        });
      }
      if (table === 'group_enrollments') {
        return makeChain({
          in: () => Promise.resolve({ data: null, error: null, count: 1 }),
        });
      }
      return makeChain();
    });

    const { GET } = await import('@/app/api/comments/eligibility/route');
    const req = new NextRequest('http://localhost/api/comments/eligibility?targetType=class&targetId=cls-1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canComment).toBe(true);
    expect(body.availableBillingPeriod).toBe('2026-04');
  });

  it('returns 400 for invalid targetType', async () => {
    const { GET } = await import('@/app/api/comments/eligibility/route');
    const req = new NextRequest('http://localhost/api/comments/eligibility?targetType=invalid&targetId=x');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
