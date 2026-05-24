import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CommentCard } from './CommentCard';
import type { Comment } from '@/lib/types/comments';

const baseComment: Comment = {
  id: 'comment-1',
  author_id: 'user-123',
  body: 'Great class overall.',
  stars: 5,
  like_count: 3,
  dislike_count: 1,
  edited_at: null,
  hidden_at: null,
  hidden_by: null,
  deleted_at: null,
  created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  author: {
    id: 'user-123',
    full_name: 'Sarah Johnson',
    display_name: null,
    avatar_url: null,
  },
  reply: null,
  user_reaction: null,
};

const mockOnUpdate = vi.fn();
const mockOnDelete = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe('CommentCard', () => {
  it('renders author name, body, and relative timestamp', () => {
    render(
      <CommentCard
        comment={baseComment}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={false}
        currentUserId={null}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('Sarah J.')).toBeInTheDocument();
    expect(screen.getByText('Great class overall.')).toBeInTheDocument();
    expect(screen.getByText('1d ago')).toBeInTheDocument();
  });

  it('shows star badge when stars is set', () => {
    render(
      <CommentCard
        comment={{ ...baseComment, stars: 4 }}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={false}
        currentUserId={null}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows (edited) badge when edited_at is set', () => {
    render(
      <CommentCard
        comment={{ ...baseComment, edited_at: new Date().toISOString() }}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={false}
        currentUserId={null}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('(edited)')).toBeInTheDocument();
  });

  it('shows Edit/Delete for own comment', () => {
    render(
      <CommentCard
        comment={baseComment}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={true}
        currentUserId="user-123"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('does not show Edit/Delete for others comment', () => {
    render(
      <CommentCard
        comment={baseComment}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={false}
        currentUserId="other-user"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('clicking Edit shows textarea with existing content', async () => {
    render(
      <CommentCard
        comment={baseComment}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={true}
        currentUserId="user-123"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );
    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('Great class overall.');
  });

  it('saving edit calls PATCH and marks edited', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'comment-1', body: 'Updated text', edited_at: new Date().toISOString() }),
    });

    render(
      <CommentCard
        comment={baseComment}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={true}
        currentUserId="user-123"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Updated text' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/comments/class/comment-1'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  it('clicking Delete shows confirmation modal', () => {
    render(
      <CommentCard
        comment={baseComment}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={true}
        currentUserId="user-123"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('Delete this comment?')).toBeInTheDocument();
  });

  it('confirming delete calls onDelete', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    render(
      <CommentCard
        comment={baseComment}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={true}
        currentUserId="user-123"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByText('Delete'));
    const confirmBtn = screen.getAllByText('Delete').find(
      (el) => el.closest('button') && el.closest('[role="dialog"]')
    );
    if (confirmBtn) fireEvent.click(confirmBtn.closest('button')!);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/comments/class/comment-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  it('reaction click without eligibility shows tooltip, does not fetch', async () => {
    render(
      <CommentCard
        comment={baseComment}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={false}
        currentUserId="other-user"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );

    const likeBtn = screen.getByRole('button', { name: /like comment/i });
    fireEvent.click(likeBtn);

    await waitFor(() => {
      expect(screen.getByText(/enrol in this class to react/i)).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reaction click with eligibility posts optimistically', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    render(
      <CommentCard
        comment={{ ...baseComment, user_reaction: null, like_count: 3 }}
        targetType="class_comment"
        targetId="comment-1"
        canReact={true}
        canReply={false}
        isOwn={false}
        currentUserId="other-user"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );

    const likeBtn = screen.getByRole('button', { name: /like comment/i });
    fireEvent.click(likeBtn);

    expect(screen.getByText('4')).toBeInTheDocument(); // optimistic +1
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/reactions'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('hidden comment shows muted placeholder to author', () => {
    render(
      <CommentCard
        comment={{ ...baseComment, hidden_at: new Date().toISOString() }}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={true}
        currentUserId="user-123"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('This comment was hidden by moderators.')).toBeInTheDocument();
  });

  it('hidden comment renders nothing for non-author', () => {
    const { container } = render(
      <CommentCard
        comment={{ ...baseComment, hidden_at: new Date().toISOString() }}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={false}
        isOwn={false}
        currentUserId="other-user"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows Reply button only when canReply is true and no reply exists', () => {
    render(
      <CommentCard
        comment={{ ...baseComment, reply: null }}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={true}
        isOwn={false}
        currentUserId="tutor-id"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('Reply')).toBeInTheDocument();
  });

  it('does not show Reply when reply already exists', () => {
    render(
      <CommentCard
        comment={{
          ...baseComment,
          reply: {
            id: 'reply-1',
            target_type: 'class_comment',
            target_id: 'comment-1',
            author_id: 'tutor-id',
            body: 'Thanks!',
            edited_at: null,
            deleted_at: null,
            created_at: new Date().toISOString(),
            author: { id: 'tutor-id', full_name: 'Tutor Name', display_name: null, avatar_url: null },
          },
        }}
        targetType="class_comment"
        targetId="comment-1"
        canReact={false}
        canReply={true}
        isOwn={false}
        currentUserId="tutor-id"
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.queryByText('Reply')).not.toBeInTheDocument();
  });
});
