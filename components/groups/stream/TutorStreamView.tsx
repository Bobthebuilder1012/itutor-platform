'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StreamPostWithAuthor } from '@/lib/types/groupStream';
import { timeAgo } from './timeAgo';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const POST_CFG: Record<string, { iconBg: string; iconStroke: string; d: string }> = {
  assignment: {
    iconBg: '#f5f3ff',
    iconStroke: '#7c3aed',
    d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8',
  },
  announcement: {
    iconBg: '#fef3c7',
    iconStroke: '#d97706',
    d: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  },
  discussion: {
    iconBg: '#e8f5ee',
    iconStroke: '#199358',
    d: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  },
  content: {
    iconBg: '#e0f2fe',
    iconStroke: '#0284c7',
    d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6',
  },
};

function PostIcon({ type }: { type: string }) {
  const cfg = POST_CFG[type] ?? POST_CFG.announcement;
  return (
    <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: cfg.iconBg }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={cfg.iconStroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={cfg.d} />
      </svg>
    </div>
  );
}

// ── types ─────────────────────────────────────────────────────────────────────

interface Submission {
  student_id: string;
  student_name: string;
  student_avatar: string | null;
  file_url: string | null;
  file_name: string | null;
  status: string | null;
  score: number | null;
  score_total: number | null;
}

interface AttachedFile { name: string; size: number; file: File; }

interface TutorStreamViewProps {
  groupId: string;
  lessonId: string;
  currentUserId: string;
  tutorName: string;
}

const PIN_DURATIONS = [
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 168 },
  { label: '30 days', hours: 720 },
];

type MenuView = 'main' | 'pin-duration';

// ── component ─────────────────────────────────────────────────────────────────

export default function TutorStreamView({ groupId, lessonId, currentUserId, tutorName }: TutorStreamViewProps) {
  const router = useRouter();
  const [posts, setPosts] = useState<StreamPostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, Submission[]>>({});
  const [submissionsLoading, setSubmissionsLoading] = useState<Record<string, boolean>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuView, setMenuView] = useState<MenuView>('main');

  // Inline edit state
  const [inlineEditingPostId, setInlineEditingPostId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Pin/unpin busy tracking (per-post)
  const [pinningId, setPinningId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [mTitle, setMTitle] = useState('');
  const [mInstructions, setMInstructions] = useState('');
  const [mDue, setMDue] = useState('');
  const [mFiles, setMFiles] = useState<AttachedFile[]>([]);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPost, setConfirmPost] = useState<{ id: string; title: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  }

  const fetchStream = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/stream?page=1&limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      setPosts(data.posts ?? []);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { fetchStream(); }, [fetchStream]);

  // Close menus on outside click — only when a menu is open, and ignore clicks
  // on the menu button/panel themselves (identified by [data-post-menu]).
  useEffect(() => {
    if (!openMenuId) return;
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-post-menu]')) return;
      setOpenMenuId(null);
      setMenuView('main');
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  // Close menu / modal on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (openMenuId) {
        setOpenMenuId(null);
        setMenuView('main');
        return;
      }
      closeModal();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openMenuId]);

  function openModal(post?: StreamPostWithAuthor) {
    if (post) {
      setEditingPostId(post.id);
      setMTitle(post.message_body);
      setMDue(post.due_date ? new Date(post.due_date).toISOString().slice(0, 16) : '');
      setMInstructions('');
    } else {
      setEditingPostId(null);
      setMTitle('');
      setMInstructions('');
      setMDue('');
      setMFiles([]);
    }
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingPostId(null);
    setMTitle('');
    setMInstructions('');
    setMDue('');
    setMFiles([]);
  }

  const postReady = mTitle.trim().length > 0;

  async function handlePost() {
    if (!postReady || posting) return;
    setPosting(true);
    try {
      const body: Record<string, unknown> = {
        post_type: 'assignment',
        message_body: mTitle.trim(),
        due_date: mDue || null,
      };
      const method = editingPostId ? 'PATCH' : 'POST';
      const url = editingPostId
        ? `/api/stream/post/${editingPostId}`
        : `/api/groups/${groupId}/stream/post`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      closeModal();
      fetchStream();
      showToast(editingPostId ? 'Assignment updated' : 'Assignment posted to stream');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  }

  function handleAttachFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files);
    setMFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...arr.filter((f) => !names.has(f.name)).map((f) => ({ name: f.name, size: f.size, file: f }))];
    });
  }

  function attachLink() {
    const url = prompt('Enter URL:');
    if (!url) return;
    setMFiles((prev) => [...prev, { name: url, size: 0, file: new File([], url) }]);
  }

  async function toggleExpand(postId: string) {
    if (expandedPostId === postId) { setExpandedPostId(null); return; }
    setExpandedPostId(postId);
    if (!submissions[postId]) {
      setSubmissionsLoading((p) => ({ ...p, [postId]: true }));
      try {
        const res = await fetch(`/api/groups/${groupId}/stream/post/${postId}/submissions`);
        if (res.ok) {
          const data = await res.json();
          setSubmissions((p) => ({ ...p, [postId]: data.submissions ?? [] }));
        }
      } finally {
        setSubmissionsLoading((p) => ({ ...p, [postId]: false }));
      }
    }
  }

  function handleGradeAI(post: StreamPostWithAuthor) {
    const subs = (submissions[post.id] ?? []).filter((s) => s.status === 'pending');
    const prefill = {
      source: 'lesson',
      lessonId,
      postId: post.id,
      sessionName: `${tutorName} — ${post.message_body}`,
      marksAvailable: post.marks_available,
      students: subs.map((s) => ({
        id: s.student_id,
        name: s.student_name,
        fileUrl: s.file_url,
        fileName: s.file_name,
      })),
    };
    sessionStorage.setItem('itutor_ai_prefill', JSON.stringify(prefill));
    router.push('/tools/ai?source=lesson');
  }

  function openDeleteConfirm(post: StreamPostWithAuthor) {
    setConfirmPost({ id: post.id, title: post.message_body });
    setConfirmOpen(true);
  }

  async function handleDelete() {
    if (!confirmPost) return;
    setDeletingId(confirmPost.id);
    setConfirmOpen(false);
    try {
      const res = await fetch(`/api/stream/post/${confirmPost.id}`, { method: 'DELETE' });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== confirmPost.id));
        showToast('Post deleted');
      }
    } finally {
      setDeletingId(null);
      setConfirmPost(null);
    }
  }

  async function handlePin(postId: string, hours: number) {
    setOpenMenuId(null);
    setMenuView('main');
    setPinningId(postId);
    try {
      const res = await fetch(`/api/stream/post/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: true, pin_duration_hours: hours }),
      });
      if (res.ok) {
        showToast('Post pinned');
        fetchStream();
      }
    } finally {
      setPinningId(null);
    }
  }

  async function handleUnpin(postId: string) {
    setOpenMenuId(null);
    setMenuView('main');
    setPinningId(postId);
    try {
      const res = await fetch(`/api/stream/post/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: false }),
      });
      if (res.ok) {
        showToast('Post unpinned');
        fetchStream();
      }
    } finally {
      setPinningId(null);
    }
  }

  function startInlineEdit(post: StreamPostWithAuthor) {
    setOpenMenuId(null);
    setMenuView('main');
    setInlineEditingPostId(post.id);
    setEditDraft(post.message_body);
    setEditError(null);
  }

  function cancelInlineEdit() {
    setInlineEditingPostId(null);
    setEditDraft('');
    setEditError(null);
  }

  async function saveInlineEdit(postId: string, original: string) {
    const trimmed = editDraft.trim();
    if (!trimmed) {
      setEditError('Post cannot be empty');
      return;
    }
    if (trimmed === original.trim()) {
      cancelInlineEdit();
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/stream/post/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_body: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to save');
      }
      setInlineEditingPostId(null);
      setEditDraft('');
      showToast('Post updated');
      fetchStream();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-[#e5e7eb] rounded-[12px] p-4 flex items-center gap-3">
            <div className="w-[38px] h-[38px] rounded-[10px] bg-[#f3f4f6] animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-[#f3f4f6] rounded animate-pulse w-3/4" />
              <div className="h-3 bg-[#f3f4f6] rounded animate-pulse w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* New assignment button */}
      <button
        onClick={() => openModal()}
        className="inline-flex items-center gap-2 mb-4 px-5 py-2.5 rounded-full text-[14px] font-semibold cursor-pointer transition-all"
        style={{ background: '#f5f3ff', border: '1.5px solid #ddd6fe', color: '#7c3aed' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#ede9fe'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#f5f3ff'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8" />
        </svg>
        New assignment
      </button>

      {/* Feed */}
      {posts.length === 0 && (
        <div className="flex flex-col items-center py-12 text-center bg-white border border-[#e5e7eb] rounded-[12px]">
          <div className="text-4xl mb-3">📝</div>
          <p className="text-sm font-semibold text-[#374151]">No posts yet</p>
          <p className="text-xs text-[#6b7280] mt-1">Create an assignment or make an announcement above.</p>
        </div>
      )}

      <div className="space-y-2.5">
        {posts.map((post) => {
          const isAssignment = post.post_type === 'assignment';
          const isExpanded = expandedPostId === post.id;
          const postSubs = submissions[post.id] ?? [];
          const submittedCount = postSubs.filter((s) => s.status === 'pending' || s.status === 'graded').length;
          const totalCount = postSubs.length;
          const hasSubmissions = submittedCount > 0;
          const isDeleting = deletingId === post.id;
          const isEditingThis = inlineEditingPostId === post.id;
          const isAuthor = post.author_id === currentUserId;
          const isPinned = !!post.pinned_at;
          const isMenuOpen = openMenuId === post.id;
          const isPinning = pinningId === post.id;

          return (
            <div
              key={post.id}
              className="bg-white border border-[#e5e7eb] rounded-[12px] overflow-visible transition-all"
              style={{ opacity: isDeleting ? 0 : 1, transform: isDeleting ? 'translateX(-8px)' : 'none', transition: 'opacity 0.3s, transform 0.3s' }}
            >
              {/* Card row */}
              <div
                className={`flex items-${isEditingThis ? 'start' : 'center'} gap-3 px-[18px] py-3.5 ${isEditingThis ? '' : 'cursor-pointer hover:bg-[#fafafa]'} transition-colors`}
                onClick={() => {
                  if (isEditingThis) return;
                  if (isAssignment) toggleExpand(post.id);
                }}
              >
                <PostIcon type={post.post_type} />

                {isEditingThis ? (
                  <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={Math.min(8, Math.max(2, editDraft.split('\n').length + 1))}
                      autoFocus
                      disabled={savingEdit}
                      className="w-full rounded-[10px] border-[1.5px] border-[#d1d5db] bg-white px-3 py-2 text-[14px] leading-[1.6] text-[#111827] outline-none focus:border-[#199358] resize-y"
                    />
                    {editError && (
                      <p className="mt-1.5 text-[11px] text-[#dc2626]">{editError}</p>
                    )}
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelInlineEdit}
                        disabled={savingEdit}
                        className="px-3 py-1.5 rounded-[8px] border border-[#e5e7eb] bg-white text-[12px] font-semibold text-[#6b7280] hover:bg-[#f9fafb] disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveInlineEdit(post.id, post.message_body)}
                        disabled={savingEdit}
                        className="px-3 py-1.5 rounded-[8px] bg-[#199358] text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50"
                      >
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isPinned && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-[2px] rounded-[4px] bg-[#fef3c7] text-[#92400e] text-[10px] font-bold uppercase tracking-[0.04em] flex-shrink-0">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L8.5 8.5 2 9.75l4.75 4.55L5.5 21 12 17.5 18.5 21l-1.25-6.7L22 9.75l-6.5-1.25z" /></svg>
                          Pinned
                        </span>
                      )}
                      <p className="text-[14px] font-semibold text-[#111827] truncate">{post.message_body}</p>
                    </div>
                    <p className="text-[12px] text-[#6b7280] mt-0.5">
                      {post.author?.full_name ?? tutorName} · {timeAgo(post.created_at)}
                      {isAssignment && post.due_date ? ` · Due ${fmtDate(post.due_date)}` : ''}
                      {isAssignment && post.marks_available ? ` · ${post.marks_available} marks` : ''}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  {isAssignment && (
                    <>
                      <span
                        className="text-[12px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                        style={hasSubmissions ? { background: '#e8f5ee', color: '#137a48' } : { background: '#f3f4f6', color: '#6b7280' }}
                      >
                        {submittedCount} / {totalCount || '?'} submitted
                      </span>
                      <button
                        onClick={() => handleGradeAI(post)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#199358] text-white rounded-[8px] text-[12px] font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                        Grade with iTutor AI
                      </button>
                    </>
                  )}

                  {/* ⋮ menu */}
                  <div className="relative" data-post-menu>
                    <button
                      data-post-menu
                      aria-label="Post actions"
                      aria-haspopup="menu"
                      aria-expanded={isMenuOpen}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isMenuOpen) {
                          setOpenMenuId(null);
                          setMenuView('main');
                        } else {
                          setOpenMenuId(post.id);
                          setMenuView('main');
                        }
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151] transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.6" />
                        <circle cx="12" cy="12" r="1.6" />
                        <circle cx="12" cy="19" r="1.6" />
                      </svg>
                    </button>
                    {isMenuOpen && (
                      <div
                        data-post-menu
                        role="menu"
                        className="absolute right-0 top-8 z-[100] bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] py-1.5 min-w-[196px]"
                      >
                        {menuView === 'main' && (
                          <>
                            {isPinned ? (
                              <button
                                onClick={() => handleUnpin(post.id)}
                                disabled={isPinning}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors text-left disabled:opacity-50"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path d="M12 17v5" />
                                  <path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" />
                                </svg>
                                {isPinning ? 'Unpinning…' : 'Unpin'}
                              </button>
                            ) : (
                              <button
                                onClick={() => setMenuView('pin-duration')}
                                disabled={isPinning}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors text-left disabled:opacity-50"
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
                            {isAuthor && (
                              <button
                                onClick={() => startInlineEdit(post)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors text-left"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                Edit
                              </button>
                            )}
                            <div className="h-px bg-[#f3f4f6] mx-1.5 my-1" />
                            <button
                              onClick={() => { setOpenMenuId(null); setMenuView('main'); openDeleteConfirm(post); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[14px] font-medium text-[#dc2626] hover:bg-[#fef2f2] transition-colors text-left"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                              Delete
                            </button>
                          </>
                        )}
                        {menuView === 'pin-duration' && (
                          <>
                            <button
                              onClick={() => setMenuView('main')}
                              className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-[.06em] text-[#6b7280] hover:bg-[#f9fafb] transition-colors text-left"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <polyline points="15 18 9 12 15 6" />
                              </svg>
                              Pin duration
                            </button>
                            {PIN_DURATIONS.map((d) => (
                              <button
                                key={d.hours}
                                onClick={() => handlePin(post.id, d.hours)}
                                disabled={isPinning}
                                className="w-full text-left px-3 py-2.5 text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors disabled:opacity-50"
                              >
                                {d.label}
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Expand panel — submissions */}
              {isAssignment && isExpanded && (
                <div className="border-t border-[#f3f4f6] px-[18px] py-3.5 bg-[#f9fafb] rounded-b-[12px]">
                  {submissionsLoading[post.id] ? (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#199358]" />
                    </div>
                  ) : (
                    <>
                      {/* Table header */}
                      <div className="grid grid-cols-[1fr_130px_110px_70px] pb-2 border-b border-[#e5e7eb] text-[11px] font-bold text-[#9ca3af] uppercase tracking-[0.04em]">
                        <span>Student</span><span>File</span><span>Status</span><span>Score</span>
                      </div>

                      {postSubs.length === 0 ? (
                        <p className="text-[13px] text-[#6b7280] py-4 text-center">No submissions yet</p>
                      ) : (
                        postSubs.map((s) => {
                          const hasFile = !!s.file_name;
                          const hasSubmitted = s.status === 'pending' || s.status === 'graded';
                          return (
                            <div
                              key={s.student_id}
                              className="grid grid-cols-[1fr_130px_110px_70px] py-2.5 border-b border-[#f3f4f6] last:border-none items-center"
                              style={{ opacity: hasSubmitted ? 1 : 0.45 }}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                  style={{ background: hasSubmitted ? '#6d28d9' : '#d1d5db' }}
                                >
                                  {getInitials(s.student_name)}
                                </div>
                                <span className={`text-[13px] font-semibold ${hasSubmitted ? 'text-[#111827]' : 'text-[#9ca3af]'}`}>{s.student_name}</span>
                              </div>
                              <span className="text-[12px] text-[#6b7280] truncate pr-2">{hasFile ? s.file_name : '—'}</span>
                              <span>
                                <span
                                  className="text-[11px] font-bold px-2 py-[3px] rounded-full"
                                  style={hasSubmitted ? { background: '#e8f5ee', color: '#137a48' } : { background: '#f3f4f6', color: '#6b7280' }}
                                >
                                  {hasSubmitted ? 'Submitted' : 'Not submitted'}
                                </span>
                              </span>
                              <span className="text-[13px] text-[#d1d5db]">
                                {s.score != null ? `${s.score}/${s.score_total}` : '—'}
                              </span>
                            </div>
                          );
                        })
                      )}

                      {/* Grade full button */}
                      <button
                        onClick={() => handleGradeAI(post)}
                        className="w-full mt-3.5 py-2.5 bg-[#199358] text-white rounded-[10px] text-[14px] font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                        Grade {submittedCount > 0 ? `${submittedCount} submission${submittedCount !== 1 ? 's' : ''}` : 'submissions'} with iTutor AI
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Assignment Modal ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center"
          style={{ background: 'rgba(13,13,13,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-white rounded-[20px] w-full max-w-[580px] mx-5 shadow-[0_24px_60px_rgba(0,0,0,0.2)] max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-[26px] pt-[22px] pb-4 border-b border-[#f3f4f6] flex items-center justify-between sticky top-0 bg-white rounded-t-[20px] z-[1]">
              <span className="text-[18px] font-extrabold text-[#111827]">
                {editingPostId ? 'Edit assignment' : 'New assignment'}
              </span>
              <button onClick={closeModal} className="text-[22px] text-[#9ca3af] hover:text-[#374151] hover:bg-[#f3f4f6] w-8 h-8 flex items-center justify-center rounded-[6px] transition-all leading-none">×</button>
            </div>

            {/* Body */}
            <div className="px-[26px] py-[22px]">
              {/* Title */}
              <div className="mb-[18px]">
                <label className="block text-[12px] font-bold text-[#6b7280] uppercase tracking-[0.04em] mb-1.5">Title *</label>
                <input
                  autoFocus
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                  placeholder="e.g. Chapter 3 Test — Submit your paper here"
                  className="w-full px-3.5 py-2.5 border-[1.5px] border-[#e5e7eb] rounded-[10px] text-[14px] outline-none focus:border-[#199358] transition-colors"
                />
              </div>

              {/* Instructions */}
              <div className="mb-[18px]">
                <label className="block text-[12px] font-bold text-[#6b7280] uppercase tracking-[0.04em] mb-1.5">Instructions</label>
                <div className="border-[1.5px] border-[#e5e7eb] rounded-[10px] overflow-hidden focus-within:border-[#199358] transition-colors">
                  <textarea
                    value={mInstructions}
                    onChange={(e) => setMInstructions(e.target.value)}
                    placeholder="Describe the assignment instructions..."
                    rows={4}
                    className="w-full px-3.5 py-3 border-none outline-none text-[14px] resize-none leading-relaxed"
                  />
                  <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-t border-[#f3f4f6] bg-[#f9fafb]">
                    {[
                      { label: 'B', style: { fontWeight: 700 } },
                      { label: 'I', style: { fontStyle: 'italic' } },
                      { label: 'U', style: { textDecoration: 'underline' } },
                    ].map((btn) => (
                      <button key={btn.label} className="w-7 h-7 rounded-[6px] flex items-center justify-center text-[13px] text-[#6b7280] hover:bg-white hover:text-[#111827] transition-all" style={btn.style}>{btn.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Due date */}
              <div className="mb-[18px]">
                <label className="block text-[12px] font-bold text-[#6b7280] uppercase tracking-[0.04em] mb-1.5">Due date (optional)</label>
                <input
                  type="datetime-local"
                  value={mDue}
                  onChange={(e) => setMDue(e.target.value)}
                  className="w-full px-3.5 py-2.5 border-[1.5px] border-[#e5e7eb] rounded-[10px] text-[14px] outline-none focus:border-[#199358] transition-colors"
                />
              </div>

              {/* Attached files */}
              {mFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-[8px] mb-1.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#199358" strokeWidth={2} className="flex-shrink-0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
                  <span className="flex-1 text-[13px] font-semibold text-[#111827] truncate">{f.name}</span>
                  {f.size > 0 && <span className="text-[11px] text-[#9ca3af]">{fmtSize(f.size)}</span>}
                  <button onClick={() => setMFiles((p) => p.filter((_, j) => j !== i))} className="text-[#d1d5db] hover:text-[#dc2626] text-[18px] leading-none transition-colors">×</button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-[26px] py-4 border-t border-[#f3f4f6] flex items-center justify-between sticky bottom-0 bg-white rounded-b-[20px]">
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-[38px] h-[38px] rounded-full border border-[#e5e7eb] flex items-center justify-center text-[#6b7280] hover:bg-[#f9fafb] hover:border-[#9ca3af] transition-all"
                  title="Attach file"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                </button>
                <button
                  onClick={attachLink}
                  className="w-[38px] h-[38px] rounded-full border border-[#e5e7eb] flex items-center justify-center text-[#6b7280] hover:bg-[#f9fafb] hover:border-[#9ca3af] transition-all"
                  title="Attach link"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
                </button>
              </div>
              <div className="flex items-center gap-2.5">
                <button onClick={closeModal} className="px-3.5 py-2 text-[14px] font-semibold text-[#199358] hover:bg-[#e8f5ee] rounded-[8px] transition-colors">Cancel</button>
                <button
                  onClick={handlePost}
                  disabled={!postReady || posting}
                  className="px-6 py-2.5 rounded-full text-[14px] font-bold transition-all"
                  style={postReady ? { background: '#199358', color: 'white' } : { background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' }}
                >
                  {posting ? 'Posting…' : editingPostId ? 'Update' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm dialog ── */}
      {confirmOpen && confirmPost && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center"
          style={{ background: 'rgba(13,13,13,0.5)', backdropFilter: 'blur(4px)' }}
        >
          <div className="bg-white rounded-[16px] px-7 py-7 max-w-[380px] w-[92vw] shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
            <p className="text-[17px] font-extrabold text-[#111827] mb-2">Delete post?</p>
            <p className="text-[14px] text-[#6b7280] leading-relaxed mb-6">
              This will permanently delete &ldquo;{confirmPost.title}&rdquo;. This cannot be undone.
            </p>
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => { setConfirmOpen(false); setConfirmPost(null); }}
                className="px-4 py-2.5 border border-[#e5e7eb] rounded-[8px] text-[14px] font-semibold text-[#374151] hover:bg-[#f9fafb] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2.5 bg-[#dc2626] text-white rounded-[8px] text-[14px] font-bold hover:opacity-90 transition-opacity"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#111827] text-white px-5 py-3 rounded-full text-[14px] font-semibold z-[2000] pointer-events-none transition-opacity duration-200 whitespace-nowrap"
        style={{ opacity: toast ? 1 : 0 }}
      >
        {toast}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => { handleAttachFiles(e.target.files); e.target.value = ''; }}
      />
    </>
  );
}
