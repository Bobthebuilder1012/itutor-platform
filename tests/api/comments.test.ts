import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: vi.fn(),
  getServerClient: vi.fn(),
}));

vi.mock('@/lib/eligibility', () => ({
  canCommentOnClass: vi.fn(),
  canCommentOnTutor: vi.fn(),
  canReplyToComment: vi.fn(),
  canReactToClassComment: vi.fn(),
  canReactToTutorComment: vi.fn(),
}));

vi.mock('@/lib/utils/commentRateLimits', () => ({
  checkCommentRateLimit: vi.fn(),
  checkReactionRateLimit: vi.fn(),
}));

vi.mock('@/lib/utils/profanity', () => ({
  isProfane: vi.fn(() => false),
}));

import { getServiceClient, getServerClient } from '@/lib/supabase/server';
import {
  canCommentOnClass,
  canCommentOnTutor,
  canReplyToComment,
  canReactToClassComment,
  canReactToTutorComment,
} from '@/lib/eligibility';
import {
  checkCommentRateLimit,
  checkReactionRateLimit,
} from '@/lib/utils/commentRateLimits';

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
      chain.is = () => chain;
      chain.single = () => Promise.resolve(result);
      chain.maybeSingle = () => Promise.resolve(result);
      return chain;
    },
  });
}

function jsonReq(body: unknown, url = 'http://localhost', method = 'POST') {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// -------------------------------------------------------
// POST /api/comments/class
// -------------------------------------------------------
describe('POST /api/comments/class', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockAuthUser(null);
    const { POST } = await import('@/app/api/comments/class/route');
    const res = await POST(jsonReq({ classId: 'c1', billingPeriod: '2026-04', body: 'Good class' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when body is too long', async () => {
    mockAuthUser('user-1');
    const { POST } = await import('@/app/api/comments/class/route');
    const res = await POST(
      jsonReq({ classId: 'c1', billingPeriod: '2026-04', body: 'x'.repeat(1001) })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when stars are out of range', async () => {
    mockAuthUser('user-1');
    const { POST } = await import('@/app/api/comments/class/route');
    const res = await POST(
      jsonReq({ classId: 'c1', billingPeriod: '2026-04', body: 'Nice', stars: 0 })
    );
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limit exceeded', async () => {
    mockAuthUser('user-1');
    (checkCommentRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { POST } = await import('@/app/api/comments/class/route');
    const res = await POST(
      jsonReq({ classId: 'c1', billingPeriod: '2026-04', body: 'Nice' })
    );
    expect(res.status).toBe(429);
  });

  it('returns 403 when ineligible', async () => {
    mockAuthUser('user-1');
    (checkCommentRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (canCommentOnClass as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { POST } = await import('@/app/api/comments/class/route');
    const res = await POST(
      jsonReq({ classId: 'c1', billingPeriod: '2026-04', body: 'Nice' })
    );
    expect(res.status).toBe(403);
  });

  it('returns 201 when eligible', async () => {
    mockAuthUser('user-1');
    (checkCommentRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (canCommentOnClass as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockServiceDb([{ data: { id: 'cm1', body: 'Nice' }, error: null }]);
    const { POST } = await import('@/app/api/comments/class/route');
    const res = await POST(
      jsonReq({ classId: 'c1', billingPeriod: '2026-04', body: 'Nice' })
    );
    expect(res.status).toBe(201);
  });
});

// -------------------------------------------------------
// PATCH /api/comments/class/:id
// -------------------------------------------------------
describe('PATCH /api/comments/class/[id]', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockAuthUser(null);
    const { PATCH } = await import('@/app/api/comments/class/[id]/route');
    const res = await PATCH(jsonReq({ body: 'edit' }, 'http://localhost', 'PATCH'), {
      params: { id: 'cm1' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when not the author', async () => {
    mockAuthUser('user-2');
    mockServiceDb([{ data: { author_id: 'user-1', deleted_at: null }, error: null }]);
    const { PATCH } = await import('@/app/api/comments/class/[id]/route');
    const res = await PATCH(jsonReq({ body: 'edit' }, 'http://localhost', 'PATCH'), {
      params: { id: 'cm1' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 200 when author edits their comment', async () => {
    mockAuthUser('user-1');
    const updated = { id: 'cm1', body: 'edited', edited_at: new Date().toISOString() };
    mockServiceDb([
      { data: { author_id: 'user-1', deleted_at: null }, error: null },
      { data: updated, error: null },
    ]);
    const { PATCH } = await import('@/app/api/comments/class/[id]/route');
    const res = await PATCH(jsonReq({ body: 'edited' }, 'http://localhost', 'PATCH'), {
      params: { id: 'cm1' },
    });
    expect(res.status).toBe(200);
  });
});

// -------------------------------------------------------
// DELETE /api/comments/class/:id
// -------------------------------------------------------
describe('DELETE /api/comments/class/[id]', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 403 when not the author', async () => {
    mockAuthUser('user-2');
    mockServiceDb([{ data: { author_id: 'user-1', deleted_at: null }, error: null }]);
    const { DELETE } = await import('@/app/api/comments/class/[id]/route');
    const res = await DELETE(
      new NextRequest('http://localhost', { method: 'DELETE' }),
      { params: { id: 'cm1' } }
    );
    expect(res.status).toBe(403);
  });

  it('returns 200 on successful soft delete', async () => {
    mockAuthUser('user-1');
    mockServiceDb([
      { data: { author_id: 'user-1', deleted_at: null }, error: null },
      { data: null, error: null },
    ]);
    const { DELETE } = await import('@/app/api/comments/class/[id]/route');
    const res = await DELETE(
      new NextRequest('http://localhost', { method: 'DELETE' }),
      { params: { id: 'cm1' } }
    );
    expect(res.status).toBe(200);
  });
});

// -------------------------------------------------------
// POST /api/comments/tutor
// -------------------------------------------------------
describe('POST /api/comments/tutor', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockAuthUser(null);
    const { POST } = await import('@/app/api/comments/tutor/route');
    const res = await POST(
      jsonReq({ tutorId: 't1', sessionId: 's1', body: 'Great tutor' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    mockAuthUser('user-1');
    (checkCommentRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { POST } = await import('@/app/api/comments/tutor/route');
    const res = await POST(
      jsonReq({ tutorId: 't1', sessionId: 's1', body: 'Great tutor' })
    );
    expect(res.status).toBe(429);
  });

  it('returns 403 when ineligible', async () => {
    mockAuthUser('user-1');
    (checkCommentRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (canCommentOnTutor as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { POST } = await import('@/app/api/comments/tutor/route');
    const res = await POST(
      jsonReq({ tutorId: 't1', sessionId: 's1', body: 'Great tutor' })
    );
    expect(res.status).toBe(403);
  });

  it('returns 201 when eligible', async () => {
    mockAuthUser('user-1');
    (checkCommentRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (canCommentOnTutor as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockServiceDb([{ data: { id: 'tc1', body: 'Great tutor' }, error: null }]);
    const { POST } = await import('@/app/api/comments/tutor/route');
    const res = await POST(
      jsonReq({ tutorId: 't1', sessionId: 's1', body: 'Great tutor' })
    );
    expect(res.status).toBe(201);
  });
});

// -------------------------------------------------------
// POST /api/comments/[targetType]/[targetId]/reactions
// -------------------------------------------------------
describe('POST reactions', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockAuthUser(null);
    const { POST } = await import(
      '@/app/api/comments/[targetType]/[targetId]/reactions/route'
    );
    const res = await POST(jsonReq({ reaction: 'like' }), {
      params: { targetType: 'class_comment', targetId: 'cm1' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid reaction value', async () => {
    mockAuthUser('user-1');
    const { POST } = await import(
      '@/app/api/comments/[targetType]/[targetId]/reactions/route'
    );
    const res = await POST(jsonReq({ reaction: 'love' }), {
      params: { targetType: 'class_comment', targetId: 'cm1' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 429 when reaction rate limited', async () => {
    mockAuthUser('user-1');
    (checkReactionRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { POST } = await import(
      '@/app/api/comments/[targetType]/[targetId]/reactions/route'
    );
    const res = await POST(jsonReq({ reaction: 'like' }), {
      params: { targetType: 'class_comment', targetId: 'cm1' },
    });
    expect(res.status).toBe(429);
  });

  it('returns 403 when ineligible to react', async () => {
    mockAuthUser('user-1');
    (checkReactionRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (canReactToClassComment as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { POST } = await import(
      '@/app/api/comments/[targetType]/[targetId]/reactions/route'
    );
    const res = await POST(jsonReq({ reaction: 'like' }), {
      params: { targetType: 'class_comment', targetId: 'cm1' },
    });
    expect(res.status).toBe(403);
  });

  it('removes reaction when toggled with same reaction type', async () => {
    mockAuthUser('user-1');
    (checkReactionRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (canReactToClassComment as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    // Return existing reaction of same type — delete chain must be thenable with .eq()
    (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: (_t: string) => {
        const deleteResult = Promise.resolve({ error: null });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const deleteChain: any = {
          eq: () => deleteResult,
          then: deleteResult.then.bind(deleteResult),
          catch: deleteResult.catch.bind(deleteResult),
        };
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.insert = () => chain;
        chain.update = () => chain;
        chain.delete = () => deleteChain;
        chain.eq = () => chain;
        chain.maybeSingle = () =>
          Promise.resolve({ data: { id: 'r1', reaction_type: 'like' }, error: null });
        chain.single = () => Promise.resolve({ data: null, error: null });
        return chain;
      },
    });
    const { POST } = await import(
      '@/app/api/comments/[targetType]/[targetId]/reactions/route'
    );
    const res = await POST(jsonReq({ reaction: 'like' }), {
      params: { targetType: 'class_comment', targetId: 'cm1' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.toggled).toBe('removed');
  });
});

// -------------------------------------------------------
// POST /api/comments/[targetType]/[targetId]/reports
// -------------------------------------------------------
describe('POST reports', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockAuthUser(null);
    const { POST } = await import(
      '@/app/api/comments/[targetType]/[targetId]/reports/route'
    );
    const res = await POST(jsonReq({ reason: 'spam' }), {
      params: { targetType: 'class_comment', targetId: 'cm1' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid reason', async () => {
    mockAuthUser('user-1');
    const { POST } = await import(
      '@/app/api/comments/[targetType]/[targetId]/reports/route'
    );
    const res = await POST(jsonReq({ reason: 'bad_vibes' }), {
      params: { targetType: 'class_comment', targetId: 'cm1' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 201 on valid report', async () => {
    mockAuthUser('user-1');
    mockServiceDb([{ data: { id: 'rpt1' }, error: null }]);
    const { POST } = await import(
      '@/app/api/comments/[targetType]/[targetId]/reports/route'
    );
    const res = await POST(jsonReq({ reason: 'spam' }), {
      params: { targetType: 'class_comment', targetId: 'cm1' },
    });
    expect(res.status).toBe(201);
  });
});

// -------------------------------------------------------
// POST /api/comments/[targetType]/[targetId]/replies
// -------------------------------------------------------
describe('POST replies', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockAuthUser(null);
    const { POST } = await import(
      '@/app/api/comments/[targetType]/[targetId]/replies/route'
    );
    const res = await POST(jsonReq({ body: 'Thanks!' }), {
      params: { targetType: 'class_comment', targetId: 'cm1' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when not the tutor', async () => {
    mockAuthUser('student-1');
    (canReplyToComment as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { POST } = await import(
      '@/app/api/comments/[targetType]/[targetId]/replies/route'
    );
    const res = await POST(jsonReq({ body: 'Thanks!' }), {
      params: { targetType: 'class_comment', targetId: 'cm1' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 201 when tutor posts reply', async () => {
    mockAuthUser('tutor-1');
    (canReplyToComment as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockServiceDb([{ data: { id: 'rep1', body: 'Thanks!' }, error: null }]);
    const { POST } = await import(
      '@/app/api/comments/[targetType]/[targetId]/replies/route'
    );
    const res = await POST(jsonReq({ body: 'Thanks!' }), {
      params: { targetType: 'class_comment', targetId: 'cm1' },
    });
    expect(res.status).toBe(201);
  });
});
