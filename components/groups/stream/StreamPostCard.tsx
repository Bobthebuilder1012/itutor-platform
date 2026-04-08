'use client';

import { useState } from 'react';
import type { StreamPostWithAuthor, StreamReplyWithAuthor } from '@/lib/types/groupStream';
import UserAvatar from '@/components/UserAvatar';
import { timeAgo } from './timeAgo';
import StreamAttachmentList from './StreamAttachmentList';
import ReplyThread from './ReplyThread';

interface StreamPostCardProps {
  post: StreamPostWithAuthor;
  isTutor: boolean;
  currentUserId: string;
  onDeleted: () => void;
  onReplyAdded: () => void;
  onPinToggled: () => void;
}

const POST_TYPE_LABELS: Record<string, string> = {
  announcement: 'Announcement',
  content: 'Learning content',
  discussion: 'Discussion',
};

export default function StreamPostCard({
  post,
  isTutor,
  currentUserId,
  onDeleted,
  onReplyAdded,
  onPinToggled,
}: StreamPostCardProps) {
  const [showReplies, setShowReplies] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [pinning, setPinning] = useState(false);

  const canDelete = isTutor || post.author_id === currentUserId;
  const isPinned = !!post.pinned_at;

  const handleDelete = async () => {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/stream/post/${post.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  const handlePinToggle = async () => {
    setPinning(true);
    try {
      const res = await fetch(`/api/stream/post/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !isPinned }),
      });
      if (res.ok) onPinToggled();
    } finally {
      setPinning(false);
    }
  };

  function countReplies(replies: StreamReplyWithAuthor[] | undefined): number {
    if (!replies?.length) return 0;
    return replies.length + replies.reduce((acc, r) => acc + countReplies(r.replies), 0);
  }
  const replyCount = countReplies(post.replies);

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        isPinned
          ? 'border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-200'
          : post.post_type === 'announcement'
          ? 'border-amber-200 bg-amber-50/50'
          : 'border-gray-200 bg-white'
      }`}
    >
      {isPinned && (
        <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold text-emerald-600">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="flex-shrink-0"><path d="M12 17v5" /><path d="M9 11l-4 4h14l-4-4" /><path d="M15 3l-3 8-3-8h6z" /></svg>
          Pinned
        </div>
      )}
      <div className="flex gap-3">
        <UserAvatar
          avatarUrl={post.author?.avatar_url}
          name={post.author?.full_name}
          size={36}
          className="flex-shrink-0"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-800">{post.author?.full_name ?? 'Unknown'}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">
                {POST_TYPE_LABELS[post.post_type] ?? post.post_type}
              </span>
              {post.author_role === 'tutor' && (
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">
                  Tutor
                </span>
              )}
              <span className="text-xs text-gray-400">{timeAgo(post.created_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              {isTutor && (
                <button
                  type="button"
                  onClick={handlePinToggle}
                  disabled={pinning}
                  className={`text-xs transition-colors disabled:opacity-40 flex items-center gap-1 ${
                    isPinned ? 'text-emerald-600 hover:text-emerald-700' : 'text-gray-400 hover:text-emerald-500'
                  }`}
                  title={isPinned ? 'Unpin post' : 'Pin to top'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}><path d="M12 17v5" /><path d="M9 11l-4 4h14l-4-4" /><path d="M15 3l-3 8-3-8h6z" /></svg>
                  {pinning ? '…' : isPinned ? 'Unpin' : 'Pin'}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          <p className="mt-1.5 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{post.message_body}</p>

          {post.attachments && post.attachments.length > 0 && (
            <StreamAttachmentList attachments={post.attachments} />
          )}

          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowReplies(!showReplies)}
              className="text-sm text-emerald-600 hover:underline font-medium"
            >
              {showReplies ? 'Hide' : 'Show'} comments {replyCount > 0 ? `(${replyCount})` : ''}
            </button>
          </div>

          {showReplies && (
            <ReplyThread
              postId={post.id}
              replies={post.replies ?? []}
              currentUserId={currentUserId}
              isTutor={isTutor}
              onReplyAdded={onReplyAdded}
            />
          )}
        </div>
      </div>
    </div>
  );
}
