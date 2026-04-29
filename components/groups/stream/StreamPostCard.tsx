'use client';

import { useState } from 'react';
import type { StreamPostWithAuthor, StreamReplyWithAuthor } from '@/lib/types/groupStream';
import UserAvatar from '@/components/UserAvatar';
import { timeAgo, getInitials } from './timeAgo';
import StreamAttachmentList from './StreamAttachmentList';
import ReplyThread from './ReplyThread';
import AssignmentPostCard from './AssignmentPostCard';

interface StreamPostCardProps {
  post: StreamPostWithAuthor;
  groupId: string;
  groupTitle: string;
  isTutor: boolean;
  currentUserId: string;
  onDeleted: () => void;
  onReplyAdded: () => void;
  onPinToggled: () => void;
}

const ACCENT: Record<string, string> = {
  announcement: 'bg-gradient-to-r from-[#0d9668] to-[#34d399]',
  discussion: 'bg-gradient-to-r from-[#3b82f6] to-[#60a5fa]',
  content: 'bg-gradient-to-r from-[#f59e0b] to-[#fbbf24]',
  assignment: 'bg-gradient-to-r from-[#7c3aed] to-[#a78bfa]',
};

const BADGE_STYLE: Record<string, string> = {
  announcement: 'bg-[#d1fae5] text-[#047857]',
  discussion: 'bg-[#dbeafe] text-[#1d4ed8]',
  content: 'bg-[#fef3c7] text-[#92400e]',
  assignment: 'bg-[#ede9fe] text-[#6d28d9]',
};

const BADGE_LABEL: Record<string, string> = {
  announcement: 'Announcement',
  discussion: 'Discussion',
  content: 'Learning Content',
  assignment: 'Assignment',
};

export default function StreamPostCard({
  post,
  groupId,
  groupTitle,
  isTutor,
  currentUserId,
  onDeleted,
  onReplyAdded,
  onPinToggled,
}: StreamPostCardProps) {
  const [showReplies, setShowReplies] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [showPinMenu, setShowPinMenu] = useState(false);

  const canDelete = isTutor || post.author_id === currentUserId;
  const isPinned = !!post.pinned_at;
  const isDiscussion = post.post_type === 'discussion';

  const pinExpiresAt = post.pin_expires_at ? new Date(post.pin_expires_at) : null;
  const pinTimeLeft = isPinned && pinExpiresAt
    ? Math.max(0, pinExpiresAt.getTime() - Date.now())
    : null;

  const PIN_DURATIONS = [
    { label: '24 hours', hours: 24 },
    { label: '7 days', hours: 168 },
    { label: '30 days', hours: 720 },
  ];

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

  const handlePin = async (durationHours: number) => {
    setShowPinMenu(false);
    setPinning(true);
    try {
      const res = await fetch(`/api/stream/post/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: true, pin_duration_hours: durationHours || undefined }),
      });
      if (res.ok) onPinToggled();
    } finally {
      setPinning(false);
    }
  };

  const handleUnpin = async () => {
    setPinning(true);
    try {
      const res = await fetch(`/api/stream/post/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: false }),
      });
      if (res.ok) onPinToggled();
    } finally {
      setPinning(false);
    }
  };

  function formatTimeLeft(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    if (hours >= 24) return `${Math.floor(hours / 24)}d left`;
    if (hours >= 1) return `${hours}h left`;
    const mins = Math.max(1, Math.floor(ms / 60000));
    return `${mins}m left`;
  }

  function countReplies(replies: StreamReplyWithAuthor[] | undefined): number {
    if (!replies?.length) return 0;
    return replies.length + replies.reduce((acc, r) => acc + countReplies(r.replies), 0);
  }
  const replyCount = countReplies(post.replies);

  const authorInitials = getInitials(post.author?.full_name ?? 'U');

  return (
    <div className="bg-white border border-[#e4e8ee] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Accent bar */}
      <div className={`h-1 rounded-t-[14px] ${ACCENT[post.post_type] ?? ACCENT.discussion}`} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3.5">
          {post.author?.avatar_url ? (
            <UserAvatar avatarUrl={post.author.avatar_url} name={post.author.full_name} size={40} className="flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#0d9668] text-white flex items-center justify-center text-[14px] font-bold flex-shrink-0">
              {authorInitials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold">{post.author?.full_name ?? 'Unknown'}</p>
            <div className="flex items-center gap-[5px] mt-[3px] flex-wrap">
              <span className={`px-2 py-[2px] rounded text-[10px] font-semibold ${BADGE_STYLE[post.post_type] ?? BADGE_STYLE.discussion}`}>
                {BADGE_LABEL[post.post_type] ?? post.post_type}
              </span>
              {post.author_role === 'tutor' && (
                <span className="px-2 py-[2px] rounded text-[10px] font-semibold bg-[#eef2ff] text-[#6366f1]">Tutor</span>
              )}
            </div>
          </div>
          <span className="text-[11px] text-[#6b7280] flex-shrink-0">{timeAgo(post.created_at)}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isTutor && (
              <div className="relative">
                {isPinned ? (
                  <button
                    type="button"
                    onClick={handleUnpin}
                    disabled={pinning}
                    className="flex items-center gap-1 px-2.5 py-[5px] rounded-md text-[11px] font-medium bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a] transition-colors disabled:opacity-40"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    {pinning ? '…' : 'Unpin'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPinMenu((p) => !p)}
                    disabled={pinning}
                    className="flex items-center gap-1 px-2.5 py-[5px] rounded-md text-[11px] font-medium text-[#6b7280] hover:bg-[#f5f7fa] hover:text-[#111827] transition-colors disabled:opacity-40"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    {pinning ? '…' : 'Pin'}
                  </button>
                )}
                {showPinMenu && (
                  <>
                    <div className="fixed inset-0 z-[9]" onClick={() => setShowPinMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-10 w-[180px] bg-white border border-[#e4e8ee] rounded-[10px] shadow-[0_4px_14px_rgba(0,0,0,0.08)] py-1.5 overflow-hidden">
                      <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] text-[#6b7280]">Pin duration</p>
                      {PIN_DURATIONS.map((d) => (
                        <button
                          key={d.hours}
                          type="button"
                          onClick={() => handlePin(d.hours)}
                          className="w-full text-left px-3 py-[7px] text-[12px] font-medium text-[#111827] hover:bg-[#f5f7fa] transition-colors"
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1 px-2.5 py-[5px] rounded-md text-[11px] font-medium text-[#6b7280] hover:bg-[#fee2e2] hover:text-[#ef4444] transition-colors disabled:opacity-40"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
                {deleting ? '…' : 'Delete'}
              </button>
            )}
          </div>
        </div>

        {/* Pinned badge */}
        {isPinned && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#fef3c7] text-[#92400e] text-[10px] font-semibold mb-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Pinned
            {pinTimeLeft !== null && pinTimeLeft > 0 && (
              <span className="text-[9px] font-medium text-[#b45309] opacity-80">· {formatTimeLeft(pinTimeLeft)}</span>
            )}
          </div>
        )}

        {/* Content */}
        <div className={`text-[14px] leading-[1.6] whitespace-pre-wrap mb-3 ${post.post_type === 'announcement' ? 'font-semibold text-[15px]' : 'text-[#111827]'}`}>
          {post.message_body}
        </div>

        {/* Assignment metadata */}
        {post.post_type === 'assignment' && (post.marks_available || post.due_date) && (
          <div className="flex flex-wrap gap-3 mb-3">
            {post.marks_available && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#6d28d9] bg-[#ede9fe] px-2.5 py-1 rounded-full">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
                {post.marks_available} marks
              </span>
            )}
            {post.due_date && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#6b7280] bg-[#f3f4f6] px-2.5 py-1 rounded-full">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                Due {new Date(post.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        )}

        {/* Attachments */}
        {post.attachments && post.attachments.length > 0 && (
          <div className="mb-3">
            <StreamAttachmentList attachments={post.attachments} />
          </div>
        )}

        {/* Assignment card — submission section */}
        {post.post_type === 'assignment' && (
          <AssignmentPostCard
            postId={post.id}
            groupId={groupId}
            groupTitle={groupTitle}
            content={post.message_body}
            marksAvailable={post.marks_available ?? null}
            dueDate={post.due_date ?? null}
            isTutor={isTutor}
            currentUserId={currentUserId}
          />
        )}

        {/* Footer — Discussion style */}
        {isDiscussion ? (
          <div className="flex items-center gap-3 pt-3 border-t border-[#e4e8ee] flex-wrap">
            <span className="flex items-center gap-1 text-[12px] text-[#6b7280]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </span>
            <button
              type="button"
              onClick={() => setShowReplies(!showReplies)}
              className={`ml-auto flex items-center gap-[5px] px-3.5 py-[7px] rounded-[10px] border text-[12px] font-semibold transition-colors ${
                showReplies
                  ? 'border-[#3b82f6] bg-[#3b82f6] text-white hover:bg-[#2563eb]'
                  : 'border-[#3b82f6] bg-[#dbeafe] text-[#1d4ed8] hover:bg-[#3b82f6] hover:text-white'
              }`}
            >
              {showReplies ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="18 15 12 9 6 15" /></svg>
                  Close thread
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                  Open thread
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="pt-3 border-t border-[#e4e8ee]">
            <button
              type="button"
              onClick={() => setShowReplies(!showReplies)}
              className="text-[11px] text-[#6b7280] hover:text-[#0d9668] hover:underline cursor-pointer"
            >
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </button>
          </div>
        )}
      </div>

      {/* Thread panel */}
      {showReplies && (
        <div className="border-t border-[#e4e8ee] px-5 py-3.5 bg-[#fafbfd]">
          <ReplyThread
            postId={post.id}
            replies={post.replies ?? []}
            currentUserId={currentUserId}
            isTutor={isTutor}
            onReplyAdded={onReplyAdded}
          />
        </div>
      )}
    </div>
  );
}
