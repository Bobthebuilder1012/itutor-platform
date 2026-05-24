'use client';

import { useState, useRef } from 'react';
import { ThumbsUp, ThumbsDown, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReportCommentModal } from './ReportCommentModal';
import type { Comment, CommentTargetType } from '@/lib/types/comments';

type Props = {
  comment: Comment;
  targetType: CommentTargetType;
  targetId: string;
  canReact: boolean;
  canReply: boolean;
  isOwn: boolean;
  currentUserId: string | null;
  onUpdate: (updated: Comment) => void;
  onDelete: (id: string) => void;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function authorDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function Avatar({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const initials = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white bg-brand shrink-0" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

export function CommentCard({ comment, targetType, targetId, canReact, canReply, isOwn, currentUserId, onUpdate, onDelete }: Props) {
  const [reaction, setReaction] = useState<'like' | 'dislike' | null>(comment.user_reaction);
  const [likes, setLikes] = useState(comment.like_count);
  const [dislikes, setDislikes] = useState(comment.dislike_count);
  const [reactionTooltip, setReactionTooltip] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [savingEdit, setSavingEdit] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [postingReply, setPostingReply] = useState(false);

  const [editingReply, setEditingReply] = useState(false);
  const [replyEditBody, setReplyEditBody] = useState(comment.reply?.body ?? '');
  const [savingReplyEdit, setSavingReplyEdit] = useState(false);

  const [showDeleteReplyConfirm, setShowDeleteReplyConfirm] = useState(false);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReplyId, setReportReplyId] = useState<string | undefined>(undefined);

  const [localComment, setLocalComment] = useState(comment);

  const authorName = localComment.author.display_name || localComment.author.full_name;
  const displayName = authorDisplayName(authorName);

  // Hidden state — show only to author
  if (localComment.hidden_at) {
    if (!isOwn) return null;
    return (
      <div className="rounded-2xl border border-border bg-muted/50 p-4 opacity-60">
        <div className="flex items-center gap-2 mb-2">
          <Avatar name={authorName} avatarUrl={localComment.author.avatar_url} size={28} />
          <span className="text-xs text-muted-foreground">{displayName}</span>
        </div>
        <p className="text-sm italic text-muted-foreground">This comment was hidden by moderators.</p>
      </div>
    );
  }

  async function handleReaction(r: 'like' | 'dislike') {
    if (!canReact) {
      setReactionTooltip(true);
      setTimeout(() => setReactionTooltip(false), 2000);
      return;
    }

    const prev = { reaction, likes, dislikes };
    // Optimistic update
    if (reaction === r) {
      setReaction(null);
      if (r === 'like') setLikes((v) => v - 1);
      else setDislikes((v) => v - 1);
    } else {
      if (reaction === 'like') setLikes((v) => v - 1);
      if (reaction === 'dislike') setDislikes((v) => v - 1);
      setReaction(r);
      if (r === 'like') setLikes((v) => v + 1);
      else setDislikes((v) => v + 1);
    }

    try {
      const res = await fetch(`/api/comments/${targetType}/${targetId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction: r }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert
      setReaction(prev.reaction);
      setLikes(prev.likes);
      setDislikes(prev.dislikes);
    }
  }

  async function handleSaveEdit() {
    if (!editBody.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const endpoint = targetType === 'class_comment'
        ? `/api/comments/class/${localComment.id}`
        : `/api/comments/tutor/${localComment.id}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      if (res.ok) {
        const updated = { ...localComment, body: editBody.trim(), edited_at: new Date().toISOString() };
        setLocalComment(updated);
        onUpdate({ ...comment, ...updated });
        setEditing(false);
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const endpoint = targetType === 'class_comment'
        ? `/api/comments/class/${localComment.id}`
        : `/api/comments/tutor/${localComment.id}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (res.ok) {
        onDelete(localComment.id);
      }
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handlePostReply() {
    if (!replyBody.trim() || postingReply) return;
    setPostingReply(true);
    try {
      const res = await fetch(`/api/comments/${targetType}/${targetId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: localComment.id, body: replyBody.trim() }),
      });
      if (res.ok) {
        const newReply = await res.json();
        setLocalComment({ ...localComment, reply: newReply });
        setReplyBody('');
        setShowReplyInput(false);
      }
    } finally {
      setPostingReply(false);
    }
  }

  async function handleSaveReplyEdit() {
    if (!replyEditBody.trim() || savingReplyEdit || !localComment.reply) return;
    setSavingReplyEdit(true);
    try {
      const res = await fetch(`/api/comments/replies/${localComment.reply.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyEditBody.trim() }),
      });
      if (res.ok) {
        const updated = { ...localComment.reply, body: replyEditBody.trim(), edited_at: new Date().toISOString() };
        setLocalComment({ ...localComment, reply: updated });
        setEditingReply(false);
      }
    } finally {
      setSavingReplyEdit(false);
    }
  }

  async function handleDeleteReply() {
    if (!localComment.reply) return;
    try {
      await fetch(`/api/comments/replies/${localComment.reply.id}`, { method: 'DELETE' });
      setLocalComment({ ...localComment, reply: null });
    } finally {
      setShowDeleteReplyConfirm(false);
    }
  }

  const replyAuthorName = localComment.reply
    ? (localComment.reply.author.display_name || localComment.reply.author.full_name)
    : '';
  const isOwnReply = localComment.reply?.author_id === currentUserId;

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      {/* Comment header */}
      <div className="flex items-start gap-3">
        <Avatar name={authorName} avatarUrl={localComment.author.avatar_url} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-ink">{displayName}</span>
            {localComment.stars && (
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                <Star className="size-3 fill-brand text-brand" />
                {localComment.stars}
              </span>
            )}
            <span className="text-xs text-muted-foreground">· {relativeTime(localComment.created_at)}</span>
            {localComment.edited_at && (
              <span className="text-[10px] text-muted-foreground italic" title={`Edited ${new Date(localComment.edited_at).toLocaleString()}`}>(edited)</span>
            )}
          </div>

          {/* Body */}
          {editing ? (
            <div className="mt-2">
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={3}
                maxLength={1000}
                autoFocus
                className="w-full p-2 rounded-xl border border-border text-sm resize-none focus:outline-none focus:border-brand"
              />
              <div className="flex items-center justify-between mt-1">
                <span className={cn('text-xs tabular-nums', editBody.length > 1000 ? 'text-red-500' : 'text-muted-foreground')}>
                  {editBody.length} / 1000
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:text-ink px-2 py-1">Cancel</button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={!editBody.trim() || editBody.length > 1000 || savingEdit}
                    className="text-xs px-3 py-1 rounded-lg bg-brand text-white font-semibold hover:bg-brand-deep disabled:opacity-50"
                  >
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-ink leading-relaxed">{localComment.body}</p>
          )}

          {/* Action bar */}
          {!editing && (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              {/* Reactions */}
              <div className="relative flex items-center gap-1">
                <button
                  onClick={() => handleReaction('like')}
                  aria-label={`Like comment (${likes} likes)`}
                  className={cn('flex items-center gap-1 text-xs transition', canReact ? 'hover:text-brand cursor-pointer' : 'cursor-default', reaction === 'like' ? 'text-brand' : 'text-muted-foreground')}
                >
                  <ThumbsUp className={cn('size-3.5', reaction === 'like' && 'fill-brand')} />
                  {likes}
                </button>
                <span className="text-muted-foreground text-xs">·</span>
                <button
                  onClick={() => handleReaction('dislike')}
                  aria-label={`Dislike comment (${dislikes} dislikes)`}
                  className={cn('flex items-center gap-1 text-xs transition', canReact ? 'hover:text-red-500 cursor-pointer' : 'cursor-default', reaction === 'dislike' ? 'text-red-500' : 'text-muted-foreground')}
                >
                  <ThumbsDown className={cn('size-3.5', reaction === 'dislike' && 'fill-red-500 text-red-500')} />
                  {dislikes}
                </button>
                {reactionTooltip && (
                  <div className="absolute bottom-full left-0 mb-1 bg-ink text-white text-[11px] rounded-lg px-2 py-1 whitespace-nowrap z-10">
                    {targetType === 'class_comment' ? 'Enrol in this class to react' : 'Book a session to react'}
                  </div>
                )}
              </div>

              <div className="flex-1" />

              {canReply && !localComment.reply && (
                <button
                  onClick={() => setShowReplyInput((v) => !v)}
                  className="text-xs text-brand font-semibold hover:text-brand-deep transition"
                >
                  Reply
                </button>
              )}

              {isOwn && (
                <>
                  <button onClick={() => { setEditing(true); setEditBody(localComment.body); }} className="text-xs text-muted-foreground hover:text-ink transition">Edit</button>
                  <button onClick={() => setShowDeleteConfirm(true)} className="text-xs text-muted-foreground hover:text-red-500 transition">Delete</button>
                </>
              )}

              {currentUserId && !isOwn && (
                <button onClick={() => { setReportReplyId(undefined); setShowReportModal(true); }} className="text-xs text-muted-foreground hover:text-ink transition">
                  Report
                </button>
              )}
            </div>
          )}

          {/* Reply input */}
          {showReplyInput && (
            <div className="mt-3 flex gap-2">
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder={`Reply to ${displayName}…`}
                rows={2}
                maxLength={1000}
                autoFocus
                className="flex-1 p-2 rounded-xl border border-border text-sm resize-none focus:outline-none focus:border-brand"
              />
              <div className="flex flex-col gap-1 justify-end">
                <button onClick={() => setShowReplyInput(false)} className="text-xs text-muted-foreground hover:text-ink px-2 py-1">Cancel</button>
                <button
                  onClick={handlePostReply}
                  disabled={!replyBody.trim() || replyBody.length > 1000 || postingReply}
                  className="text-xs px-3 py-1 rounded-lg bg-brand text-white font-semibold hover:bg-brand-deep disabled:opacity-50"
                >
                  {postingReply ? '…' : 'Post Reply'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tutor reply */}
      {localComment.reply && (
        <div className="mt-3 ml-10 pl-4 border-l-2 border-gray-100">
          <div className="flex items-start gap-2">
            <Avatar name={replyAuthorName} avatarUrl={localComment.reply.author.avatar_url} size={24} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-ink">{replyAuthorName}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand text-white text-[10px] font-bold">Tutor</span>
                <span className="text-[11px] text-muted-foreground">· {relativeTime(localComment.reply.created_at)}</span>
                {localComment.reply.edited_at && <span className="text-[10px] text-muted-foreground italic">(edited)</span>}
              </div>

              {editingReply ? (
                <div className="mt-1">
                  <textarea
                    value={replyEditBody}
                    onChange={(e) => setReplyEditBody(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    autoFocus
                    className="w-full p-2 rounded-xl border border-border text-sm resize-none focus:outline-none focus:border-brand"
                  />
                  <div className="flex justify-end gap-2 mt-1">
                    <button onClick={() => setEditingReply(false)} className="text-xs text-muted-foreground hover:text-ink px-2 py-1">Cancel</button>
                    <button onClick={handleSaveReplyEdit} disabled={savingReplyEdit} className="text-xs px-3 py-1 rounded-lg bg-brand text-white font-semibold hover:bg-brand-deep disabled:opacity-50">
                      {savingReplyEdit ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-0.5 text-sm text-ink leading-relaxed">{localComment.reply.body}</p>
              )}

              {!editingReply && isOwnReply && (
                <div className="mt-1 flex gap-2">
                  <button onClick={() => { setEditingReply(true); setReplyEditBody(localComment.reply!.body); }} className="text-xs text-muted-foreground hover:text-ink transition">Edit</button>
                  <button onClick={() => setShowDeleteReplyConfirm(true)} className="text-xs text-muted-foreground hover:text-red-500 transition">Delete</button>
                </div>
              )}

              {!editingReply && currentUserId && !isOwnReply && (
                <button
                  onClick={() => { setReportReplyId(localComment.reply!.id); setShowReportModal(true); }}
                  className="mt-1 text-xs text-muted-foreground hover:text-ink transition"
                >
                  Report
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete comment confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-pop p-6 text-center">
            <h3 className="text-base font-bold text-ink">Delete this comment?</h3>
            <p className="text-sm text-muted-foreground mt-2">
              {localComment.reply ? "Your tutor's reply will also be removed. " : ''}This cannot be undone.
            </p>
            <div className="mt-5 flex gap-2 justify-center">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete reply confirmation */}
      {showDeleteReplyConfirm && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-pop p-6 text-center">
            <h3 className="text-base font-bold text-ink">Delete this reply?</h3>
            <p className="text-sm text-muted-foreground mt-2">This cannot be undone.</p>
            <div className="mt-5 flex gap-2 justify-center">
              <button onClick={() => setShowDeleteReplyConfirm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition">Cancel</button>
              <button onClick={handleDeleteReply} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {showReportModal && (
        <ReportCommentModal
          targetType={targetType}
          targetId={targetId}
          replyId={reportReplyId}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}
