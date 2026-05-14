'use client';

import { useEffect, useRef, useState } from 'react';
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

  // Unified three-dot menu state
  type MenuView = 'main' | 'pin-duration' | 'delete-confirm';
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>('main');
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Inline edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(post.message_body);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Fade-out on delete
  const [removing, setRemoving] = useState(false);

  const isAuthor = post.author_id === currentUserId;
  const canDelete = isTutor || isAuthor;
  const canEdit = isAuthor;
  const showMenu = isTutor; // students never see the menu
  const isPinned = !!post.pinned_at;
  const isDiscussion = post.post_type === 'discussion';

  // Close dropdown on click outside / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  // Close any other open menu when this one opens (single-open behavior)
  useEffect(() => {
    if (!menuOpen) return;
    const detail = { postId: post.id };
    const handler = (e: Event) => {
      const other = (e as CustomEvent<{ postId: string }>).detail;
      if (other?.postId !== post.id) {
        setMenuOpen(false);
        setMenuView('main');
      }
    };
    window.dispatchEvent(new CustomEvent('stream-menu-open', { detail }));
    window.addEventListener('stream-menu-open', handler);
    return () => window.removeEventListener('stream-menu-open', handler);
  }, [menuOpen, post.id]);

  const closeMenu = () => {
    setMenuOpen(false);
    setMenuView('main');
  };

  const openMenu = () => {
    setMenuView('main');
    setMenuOpen((v) => !v);
  };

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
    setDeleting(true);
    setRemoving(true);
    try {
      const res = await fetch(`/api/stream/post/${post.id}`, { method: 'DELETE' });
      if (res.ok) {
        // Let the fade-out animation play briefly before removing from list
        setTimeout(() => onDeleted(), 180);
      } else {
        setRemoving(false);
      }
    } catch {
      setRemoving(false);
    } finally {
      setDeleting(false);
      closeMenu();
    }
  };

  const handlePin = async (durationHours: number) => {
    setPinning(true);
    closeMenu();
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
    closeMenu();
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

  const startEdit = () => {
    setEditDraft(post.message_body);
    setEditError(null);
    setIsEditing(true);
    closeMenu();
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditDraft(post.message_body);
    setEditError(null);
  };

  const saveEdit = async () => {
    const trimmed = editDraft.trim();
    if (!trimmed) {
      setEditError('Message cannot be empty');
      return;
    }
    if (trimmed === post.message_body.trim()) {
      cancelEdit();
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/stream/post/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_body: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to save');
      }
      setIsEditing(false);
      onReplyAdded(); // reuse the refresh callback — reloads posts
    } catch (err: any) {
      setEditError(err?.message ?? 'Failed to save');
    } finally {
      setSavingEdit(false);
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
    <div
      className={`bg-white border border-[#e4e8ee] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-200 ease-out ${
        removing ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'
      }`}
    >
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
          {showMenu && (
            <div className="relative flex-shrink-0">
              <button
                ref={menuButtonRef}
                type="button"
                onClick={openMenu}
                aria-label="Post actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="w-7 h-7 rounded-md flex items-center justify-center text-[#6b7280] hover:bg-[#f5f7fa] hover:text-[#111827] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" />
                </svg>
              </button>

              {menuOpen && (
                <div
                  ref={menuRef}
                  role="menu"
                  className="absolute right-0 top-full mt-1 z-20 w-[200px] bg-white border border-[#e4e8ee] rounded-[10px] shadow-[0_6px_20px_rgba(0,0,0,0.10)] py-1.5 overflow-hidden"
                >
                  {menuView === 'main' && (
                    <>
                      {isPinned ? (
                        <button
                          type="button"
                          onClick={handleUnpin}
                          disabled={pinning}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] font-medium text-[#111827] hover:bg-[#f5f7fa] transition-colors disabled:opacity-40"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M12 17v5" />
                            <path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" />
                          </svg>
                          {pinning ? 'Unpinning…' : 'Unpin'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMenuView('pin-duration')}
                          disabled={pinning}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] font-medium text-[#111827] hover:bg-[#f5f7fa] transition-colors disabled:opacity-40"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M12 17v5" />
                            <path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" />
                          </svg>
                          Pin
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="ml-auto text-[#9ca3af]">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      )}

                      {canEdit && (
                        <button
                          type="button"
                          onClick={startEdit}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] font-medium text-[#111827] hover:bg-[#f5f7fa] transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit
                        </button>
                      )}

                      {canDelete && (
                        <>
                          <div className="my-1 border-t border-[#eef1f5]" />
                          <button
                            type="button"
                            onClick={() => setMenuView('delete-confirm')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] font-medium text-[#ef4444] hover:bg-[#fee2e2] transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
                            </svg>
                            Delete
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {menuView === 'pin-duration' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setMenuView('main')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] text-[#6b7280] hover:bg-[#f5f7fa] transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <polyline points="15 18 9 12 15 6" />
                        </svg>
                        Pin duration
                      </button>
                      {PIN_DURATIONS.map((d) => (
                        <button
                          key={d.hours}
                          type="button"
                          onClick={() => handlePin(d.hours)}
                          disabled={pinning}
                          className="w-full text-left px-3 py-2 text-[12.5px] font-medium text-[#111827] hover:bg-[#f5f7fa] transition-colors disabled:opacity-40"
                        >
                          {d.label}
                        </button>
                      ))}
                    </>
                  )}

                  {menuView === 'delete-confirm' && (
                    <div className="px-3 py-2.5">
                      <p className="text-[12px] font-semibold text-[#111827] mb-0.5">
                        Delete this post?
                      </p>
                      <p className="text-[11px] text-[#6b7280] mb-2.5">
                        This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setMenuView('main')}
                          className="flex-1 px-2.5 py-1.5 rounded-[7px] border border-[#e4e8ee] bg-white text-[11px] font-semibold text-[#6b7280] hover:bg-[#f5f7fa] transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={deleting}
                          className="flex-1 px-2.5 py-1.5 rounded-[7px] bg-[#ef4444] text-white text-[11px] font-semibold hover:bg-[#dc2626] transition-colors disabled:opacity-50"
                        >
                          {deleting ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
        {isEditing ? (
          <div className="mb-3">
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              rows={Math.min(10, Math.max(3, editDraft.split('\n').length + 1))}
              autoFocus
              disabled={savingEdit}
              className="w-full rounded-[10px] border border-[#d1d5db] bg-white px-3 py-2 text-[14px] leading-[1.6] text-[#111827] outline-none focus:border-[#0d9668] focus:ring-2 focus:ring-[#0d9668]/20 resize-y"
            />
            {editError && (
              <p className="mt-1.5 text-[11px] text-[#ef4444]">{editError}</p>
            )}
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={savingEdit}
                className="px-3 py-1.5 rounded-[8px] border border-[#e4e8ee] bg-white text-[12px] font-semibold text-[#6b7280] hover:bg-[#f5f7fa] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={savingEdit}
                className="px-3 py-1.5 rounded-[8px] bg-[#0d9668] text-white text-[12px] font-semibold hover:bg-[#047857] transition-colors disabled:opacity-50"
              >
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className={`text-[14px] leading-[1.6] whitespace-pre-wrap mb-3 ${post.post_type === 'announcement' ? 'font-semibold text-[15px]' : 'text-[#111827]'}`}>
            {post.message_body}
          </div>
        )}

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
