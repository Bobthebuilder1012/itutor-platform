import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canCommentOnClass,
  canCommentOnTutor,
  canReactToClassComment,
  canReactToTutorComment,
  canReplyToComment,
  canRateClass,
} from './eligibility';

// -------------------------------------------------------
// Supabase service client mock
// -------------------------------------------------------
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIs = vi.fn();
const mockGt = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();

// Build a fluent chain that is also thenable so `await chain` resolves.
// Supabase PostgREST builders are thenables; this mock mirrors that.
function buildChain(result: { data?: unknown; count?: number; error?: unknown }) {
  const promise = Promise.resolve(result);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.is = () => chain;
  chain.not = () => chain;
  chain.gt = () => chain;
  chain.lt = () => chain;
  chain.gte = () => chain;
  chain.or = () => chain;
  chain.single = () => promise;
  chain.maybeSingle = () => promise;
  // Make the chain itself awaitable (mirrors Supabase's thenable builder)
  chain.then = (resolve: Parameters<typeof promise.then>[0], reject: Parameters<typeof promise.then>[1]) =>
    promise.then(resolve, reject);
  chain.catch = (reject: Parameters<typeof promise.catch>[0]) => promise.catch(reject);
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: vi.fn(),
}));

import { getServiceClient } from '@/lib/supabase/server';

// Helper to set up the mock for a given query sequence
function setupMockDb(calls: Array<{ data?: unknown; count?: number; error?: unknown }>) {
  let callIndex = 0;
  (getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: (_table: string) => buildChain(calls[callIndex++] ?? { data: null, count: 0 }),
  });
}

// -------------------------------------------------------
// canCommentOnClass
// -------------------------------------------------------
describe('canCommentOnClass', () => {
  it('returns true when eligible (no existing comment, prompt exists)', async () => {
    setupMockDb([
      { count: 0 },   // class_comments count (no existing comment)
      { count: 1 },   // rating_prompts count (prompt exists)
    ]);
    expect(await canCommentOnClass('student-1', 'class-1', '2026-04')).toBe(true);
  });

  it('returns false when comment already exists for this period', async () => {
    setupMockDb([
      { count: 1 },   // class_comments count (existing comment found)
      { count: 1 },
    ]);
    expect(await canCommentOnClass('student-1', 'class-1', '2026-04')).toBe(false);
  });

  it('returns false when no rating prompt exists (period not closed)', async () => {
    setupMockDb([
      { count: 0 },   // no existing comment
      { count: 0 },   // no rating_prompt → not enrolled / period not closed
    ]);
    expect(await canCommentOnClass('student-1', 'class-1', '2026-04')).toBe(false);
  });

  it('returns false when student never enrolled (no prompt at all)', async () => {
    setupMockDb([
      { count: 0 },
      { count: 0 },
    ]);
    expect(await canCommentOnClass('other-student', 'class-1', '2026-04')).toBe(false);
  });
});

// -------------------------------------------------------
// canCommentOnTutor
// -------------------------------------------------------
describe('canCommentOnTutor', () => {
  const completedSession = {
    id: 'session-1',
    student_id: 'student-1',
    tutor_id: 'tutor-1',
    status: 'completed',
  };

  it('returns true when session is completed and no existing comment', async () => {
    setupMockDb([
      { data: completedSession },  // sessions query
      { count: 0 },                // tutor_profile_comments count
    ]);
    expect(await canCommentOnTutor('student-1', 'tutor-1', 'session-1')).toBe(true);
  });

  it('returns false when session does not exist', async () => {
    setupMockDb([{ data: null }]);
    expect(await canCommentOnTutor('student-1', 'tutor-1', 'session-1')).toBe(false);
  });

  it('returns false when student_id does not match', async () => {
    setupMockDb([
      { data: { ...completedSession, student_id: 'other-student' } },
    ]);
    expect(await canCommentOnTutor('student-1', 'tutor-1', 'session-1')).toBe(false);
  });

  it('returns false when tutor_id does not match', async () => {
    setupMockDb([
      { data: { ...completedSession, tutor_id: 'other-tutor' } },
    ]);
    expect(await canCommentOnTutor('student-1', 'tutor-1', 'session-1')).toBe(false);
  });

  it('returns false when session is not completed', async () => {
    setupMockDb([
      { data: { ...completedSession, status: 'scheduled' } },
    ]);
    expect(await canCommentOnTutor('student-1', 'tutor-1', 'session-1')).toBe(false);
  });

  it('returns false when comment already exists for this session', async () => {
    setupMockDb([
      { data: completedSession },
      { count: 1 },
    ]);
    expect(await canCommentOnTutor('student-1', 'tutor-1', 'session-1')).toBe(false);
  });

  it('returns false when checking wrong class (eligibility for wrong tutor)', async () => {
    setupMockDb([
      { data: { ...completedSession, tutor_id: 'wrong-tutor' } },
    ]);
    expect(await canCommentOnTutor('student-1', 'tutor-1', 'session-1')).toBe(false);
  });
});

// -------------------------------------------------------
// canReactToClassComment
// -------------------------------------------------------
describe('canReactToClassComment', () => {
  it('returns true when user has a completed cycle for the comment class', async () => {
    setupMockDb([
      { data: { class_id: 'class-1' } },  // comment lookup
      { count: 1 },                        // rating_prompts count
    ]);
    expect(await canReactToClassComment('user-1', 'comment-1')).toBe(true);
  });

  it('returns false when comment does not exist', async () => {
    setupMockDb([{ data: null }]);
    expect(await canReactToClassComment('user-1', 'comment-1')).toBe(false);
  });

  it('returns false when user has no completed cycle for the class', async () => {
    setupMockDb([
      { data: { class_id: 'class-1' } },
      { count: 0 },
    ]);
    expect(await canReactToClassComment('user-1', 'comment-1')).toBe(false);
  });

  it('returns false when checking wrong class (never enrolled)', async () => {
    setupMockDb([
      { data: { class_id: 'class-x' } },
      { count: 0 },
    ]);
    expect(await canReactToClassComment('user-1', 'comment-1')).toBe(false);
  });
});

// -------------------------------------------------------
// canReactToTutorComment
// -------------------------------------------------------
describe('canReactToTutorComment', () => {
  it('returns true when user has at least one completed session with tutor', async () => {
    setupMockDb([
      { data: { tutor_id: 'tutor-1' } },
      { count: 2 },
    ]);
    expect(await canReactToTutorComment('user-1', 'comment-1')).toBe(true);
  });

  it('returns false when comment does not exist', async () => {
    setupMockDb([{ data: null }]);
    expect(await canReactToTutorComment('user-1', 'comment-1')).toBe(false);
  });

  it('returns false when user has no completed session with tutor', async () => {
    setupMockDb([
      { data: { tutor_id: 'tutor-1' } },
      { count: 0 },
    ]);
    expect(await canReactToTutorComment('user-1', 'comment-1')).toBe(false);
  });

  it('returns false when checking wrong tutor (no session with them)', async () => {
    setupMockDb([
      { data: { tutor_id: 'tutor-x' } },
      { count: 0 },
    ]);
    expect(await canReactToTutorComment('user-1', 'comment-1')).toBe(false);
  });
});

// -------------------------------------------------------
// canReplyToComment
// -------------------------------------------------------
describe('canReplyToComment', () => {
  it('returns true for class_comment when user is the class tutor', async () => {
    setupMockDb([
      { data: { class_id: 'class-1' } },
      { data: { tutor_id: 'tutor-1' } },
    ]);
    expect(await canReplyToComment('tutor-1', 'class_comment', 'comment-1')).toBe(true);
  });

  it('returns false for class_comment when user is NOT the class tutor', async () => {
    setupMockDb([
      { data: { class_id: 'class-1' } },
      { data: { tutor_id: 'other-tutor' } },
    ]);
    expect(await canReplyToComment('tutor-1', 'class_comment', 'comment-1')).toBe(false);
  });

  it('returns false for class_comment when comment does not exist', async () => {
    setupMockDb([{ data: null }]);
    expect(await canReplyToComment('tutor-1', 'class_comment', 'comment-1')).toBe(false);
  });

  it('returns true for tutor_profile_comment when user is the tutor', async () => {
    setupMockDb([
      { data: { tutor_id: 'tutor-1' } },
    ]);
    expect(await canReplyToComment('tutor-1', 'tutor_profile_comment', 'comment-1')).toBe(true);
  });

  it('returns false for tutor_profile_comment when user is NOT the tutor', async () => {
    setupMockDb([
      { data: { tutor_id: 'other-tutor' } },
    ]);
    expect(await canReplyToComment('tutor-1', 'tutor_profile_comment', 'comment-1')).toBe(false);
  });

  it('returns false for tutor_profile_comment when comment does not exist', async () => {
    setupMockDb([{ data: null }]);
    expect(await canReplyToComment('tutor-1', 'tutor_profile_comment', 'comment-1')).toBe(false);
  });

  it('prevents tutor from commenting on own class (not the author eligibility path)', async () => {
    // canReplyToComment checks tutor ownership, not student eligibility.
    // The student trying to reply (not a tutor) gets false.
    setupMockDb([
      { data: { class_id: 'class-1' } },
      { data: { tutor_id: 'tutor-1' } },
    ]);
    expect(await canReplyToComment('student-1', 'class_comment', 'comment-1')).toBe(false);
  });
});

// -------------------------------------------------------
// canRateClass
// -------------------------------------------------------
describe('canRateClass', () => {
  it('returns true when pending prompt exists and no rating yet', async () => {
    setupMockDb([
      { data: { id: 'prompt-1', expires_at: new Date(Date.now() + 1000000).toISOString(), status: 'pending' } },
      { count: 0 },
    ]);
    expect(await canRateClass('student-1', 'class-1', '2026-04')).toBe(true);
  });

  it('returns false when no prompt exists', async () => {
    setupMockDb([{ data: null }]);
    expect(await canRateClass('student-1', 'class-1', '2026-04')).toBe(false);
  });

  it('returns false when prompt is expired (status=expired, not returned by query)', async () => {
    // Query filters status='pending' AND expires_at > now — null means no match
    setupMockDb([{ data: null }]);
    expect(await canRateClass('student-1', 'class-1', '2026-04')).toBe(false);
  });

  it('returns false when rating already exists for this period', async () => {
    setupMockDb([
      { data: { id: 'prompt-1', expires_at: new Date(Date.now() + 1000000).toISOString(), status: 'pending' } },
      { count: 1 },
    ]);
    expect(await canRateClass('student-1', 'class-1', '2026-04')).toBe(false);
  });

  it('returns false when student has no prompt at all (never enrolled)', async () => {
    setupMockDb([{ data: null }]);
    expect(await canRateClass('never-enrolled', 'class-1', '2026-04')).toBe(false);
  });

  it('returns false when checking eligibility for wrong class', async () => {
    setupMockDb([{ data: null }]);
    expect(await canRateClass('student-1', 'wrong-class', '2026-04')).toBe(false);
  });
});
