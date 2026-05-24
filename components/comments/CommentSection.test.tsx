import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CommentSection } from './CommentSection';

// Mock supabase client
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

const mockEligibility = {
  canComment: false,
  canReact: false,
  hasExistingComment: false,
};

const mockCommentsResponse = {
  comments: [
    {
      id: 'c1',
      author_id: 'u1',
      body: 'Test comment',
      stars: 4,
      like_count: 2,
      dislike_count: 0,
      edited_at: null,
      hidden_at: null,
      hidden_by: null,
      deleted_at: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      author: { id: 'u1', full_name: 'Alice Smith', display_name: null, avatar_url: null },
      reply: null,
      user_reaction: null,
    },
  ],
  total: 1,
};

function setupFetch(eligibility = mockEligibility, commentsRes = mockCommentsResponse) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/eligibility')) {
      return Promise.resolve({ ok: true, json: async () => eligibility });
    }
    if (url.includes('/api/comments/')) {
      return Promise.resolve({ ok: true, json: async () => commentsRes });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CommentSection', () => {
  it('renders header with correct count after load', async () => {
    setupFetch();
    render(
      <CommentSection
        targetType="class"
        targetId="class-1"
        starFilter={null}
        onClearFilter={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Reviews & Comments')).toBeInTheDocument();
      expect(screen.getByText('(1)')).toBeInTheDocument();
    });
  });

  it('shows comment in list', async () => {
    setupFetch();
    render(
      <CommentSection
        targetType="class"
        targetId="class-1"
        starFilter={null}
        onClearFilter={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Test comment')).toBeInTheDocument();
    });
  });

  it('shows write input when eligible to comment', async () => {
    setupFetch({ ...mockEligibility, canComment: true, availableBillingPeriod: '2026-04' });
    render(
      <CommentSection
        targetType="class"
        targetId="class-1"
        starFilter={null}
        onClearFilter={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Share your experience with this class.')).toBeInTheDocument();
    });
  });

  it('hides write input when not eligible', async () => {
    setupFetch({ canComment: false, canReact: false, hasExistingComment: false });
    render(
      <CommentSection
        targetType="class"
        targetId="class-1"
        starFilter={null}
        onClearFilter={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Share your experience with this class.')).not.toBeInTheDocument();
    });
  });

  it('shows "already shared feedback" when has existing comment', async () => {
    setupFetch({ canComment: false, canReact: true, hasExistingComment: true });
    render(
      <CommentSection
        targetType="class"
        targetId="class-1"
        starFilter={null}
        onClearFilter={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/already shared feedback/i)).toBeInTheDocument();
    });
  });

  it('renders filter chip when starFilter is set', async () => {
    setupFetch();
    render(
      <CommentSection
        targetType="class"
        targetId="class-1"
        starFilter={4}
        onClearFilter={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Showing 4★ ratings only')).toBeInTheDocument();
    });
  });

  it('clicking Clear filter chip calls onClearFilter', async () => {
    const onClearFilter = vi.fn();
    setupFetch();
    render(
      <CommentSection
        targetType="class"
        targetId="class-1"
        starFilter={5}
        onClearFilter={onClearFilter}
      />
    );

    await waitFor(() => {
      const clearBtn = screen.getByRole('button', { name: /clear star filter/i });
      fireEvent.click(clearBtn);
    });

    expect(onClearFilter).toHaveBeenCalledOnce();
  });

  it('shows empty state when no comments and can comment', async () => {
    setupFetch({ ...mockEligibility, canComment: true, availableBillingPeriod: '2026-04' }, { comments: [], total: 0 });
    render(
      <CommentSection
        targetType="class"
        targetId="class-1"
        starFilter={null}
        onClearFilter={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No comments yet. Be the first to share your experience.')).toBeInTheDocument();
    });
  });

  it('shows filter-specific empty state when star filter active and no results', async () => {
    setupFetch(mockEligibility, { comments: [], total: 0 });
    render(
      <CommentSection
        targetType="class"
        targetId="class-1"
        starFilter={1}
        onClearFilter={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No comments at this rating level yet.')).toBeInTheDocument();
    });
  });

  it('uses tutor variant placeholder for tutor_profile target', async () => {
    setupFetch({ ...mockEligibility, canComment: true, availableSessionIds: ['session-1'] });
    render(
      <CommentSection
        targetType="tutor_profile"
        targetId="tutor-1"
        starFilter={null}
        onClearFilter={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Share your experience with this tutor.')).toBeInTheDocument();
    });
  });
});
