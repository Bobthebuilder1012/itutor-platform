'use client';

import { useState } from 'react';
import type { StreamReplyWithAuthor } from '@/lib/types/groupStream';
import UserAvatar from '@/components/UserAvatar';
import { timeAgo } from './timeAgo';

interface ReplyThreadProps {
  postId: string;
  replies: StreamReplyWithAuthor[];
  currentUserId: string;
  isTutor: boolean;
  onReplyAdded: () => void;
}

function ReplyItem({
  reply,
  postId,
  depth,
  currentUserId,
  onReplyAdded,
}: {
  reply: StreamReplyWithAuthor;
  postId: string;
  depth: number;
  currentUserId: string;
  onReplyAdded: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showInput, setShowInput] = useState(false);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasChildren = (reply.replies?.length ?? 0) > 0;
  const marginLeft = Math.min(depth * 20, 80);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/stream/reply/${reply.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_body: body.trim() }),
      });
      if (res.ok) {
        setBody('');
        setShowInput(false);
        onReplyAdded();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2" style={{ marginLeft: marginLeft ? `${marginLeft}px` : undefined }}>
      <div className="flex gap-2">
        <UserAvatar
          avatarUrl={reply.author?.avatar_url}
          name={reply.author?.full_name}
          size={28}
          className="flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{reply.author?.full_name ?? 'Unknown'}</span>
            <span className="text-xs text-gray-400">{timeAgo(reply.created_at)}</span>
            {hasChildren && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-emerald-600 hover:underline"
              >
                {expanded ? 'Collapse' : 'Expand'} replies
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowInput(!showInput)}
              className="text-xs text-emerald-600 hover:underline"
            >
              Reply
            </button>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap mt-0.5">{reply.message_body}</p>
          {showInput && (
            <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
              <input
                type="text"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write a reply…"
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                disabled={submitting}
              />
              <button
                type="submit"
                disabled={submitting || !body.trim()}
                className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
              >
                {submitting ? '…' : 'Reply'}
              </button>
            </form>
          )}
          {expanded && (reply.replies?.length ?? 0) > 0 && (
            <div className="border-l-2 border-gray-100 pl-2 mt-1">
              {reply.replies!.map((r) => (
                <ReplyItem
                  key={r.id}
                  reply={r}
                  postId={postId}
                  depth={depth + 1}
                  currentUserId={currentUserId}
                  onReplyAdded={onReplyAdded}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReplyThread({
  postId,
  replies,
  currentUserId,
  isTutor,
  onReplyAdded,
}: ReplyThreadProps) {
  const [showComposer, setShowComposer] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const rootReplies = replies.filter((r) => !r.parent_reply_id);

  const handlePostReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/stream/post/${postId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_body: replyBody.trim() }),
      });
      if (res.ok) {
        setReplyBody('');
        setShowComposer(false);
        onReplyAdded();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-500 mb-2">Class comments</p>
      {rootReplies.map((r) => (
        <ReplyItem
          key={r.id}
          reply={r}
          postId={postId}
          depth={0}
          currentUserId={currentUserId}
          onReplyAdded={onReplyAdded}
        />
      ))}
      {!showComposer ? (
        <button
          type="button"
          onClick={() => setShowComposer(true)}
          className="mt-2 w-full text-left py-2 px-3 rounded-lg border border-dashed border-gray-200 text-sm text-gray-500 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/50 transition-colors"
        >
          Add class comment…
        </button>
      ) : (
        <form onSubmit={handlePostReply} className="mt-2 space-y-2">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Add a comment for the class…"
            rows={2}
            disabled={submitting}
            autoFocus
            className="w-full resize-none border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting || !replyBody.trim()}
              className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg disabled:opacity-40"
            >
              {submitting ? 'Posting…' : 'Comment'}
            </button>
            <button
              type="button"
              onClick={() => { setShowComposer(false); setReplyBody(''); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
