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
}: StreamPostCardProps) {
  const [showReplies, setShowReplies] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const canDelete = isTutor || post.author_id === currentUserId;

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

  function countReplies(replies: StreamReplyWithAuthor[] | undefined): number {
    if (!replies?.length) return 0;
    return replies.length + replies.reduce((acc, r) => acc + countReplies(r.replies), 0);
  }
  const replyCount = countReplies(post.replies);

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        post.post_type === 'announcement' ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'
      }`}
    >
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
