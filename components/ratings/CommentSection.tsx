'use client';

import { useEffect, useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, Pencil, Trash2, MessageSquare, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarRow, StarInput } from './StarInput';
import { supabase } from '@/lib/supabase/client';
import { useProfile } from '@/lib/hooks/useProfile';

type Review = {
  id: string;
  reviewer_id: string;
  authorName: string;
  authorAvatar: string | null;
  authorInitials: string;
  authorHue: number;
  body: string | null;
  rating: number;
  createdAt: string;
  tutor_reply: string | null;
  tutor_replied_at: string | null;
};

type Props = {
  targetKind: 'class' | 'tutor';
  targetId: string;
  viewerIsOwnerTutor?: boolean;
  viewerLoggedIn?: boolean;
  activeRatingFilter: number | null;
  onClearFilter: () => void;
};

const PAGE = 10;

function Avatar({ name, hue, avatar, size = 40 }: { name: string; hue: number; avatar?: string | null; size?: number }) {
  const initials = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  if (avatar) return <img src={avatar} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  return (
    <div className="rounded-full inline-flex items-center justify-center font-bold shrink-0 text-sm"
      style={{ width: size, height: size, background: `oklch(0.85 0.1 ${hue})`, color: `oklch(0.28 0.07 ${hue})`, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

function hueFromName(name: string): number {
  return Math.abs([...name].reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
}

export function CommentSection({ targetKind, targetId, viewerIsOwnerTutor, viewerLoggedIn = true, activeRatingFilter, onClearFilter }: Props) {
  const { profile } = useProfile();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(PAGE);

  // New review
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [eligibleSessionId, setEligibleSessionId] = useState<string | null | undefined>(undefined); // undefined = loading
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  // Edit review
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Tutor reply
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replySaving, setReplySaving] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [replyEditDraft, setReplyEditDraft] = useState('');

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      if (targetKind === 'class') {
        const res = await fetch(`/api/groups/${targetId}/reviews?limit=100&sortBy=recent`);
        if (!res.ok) { setReviews([]); return; }
        const json = await res.json();
        const items: any[] = json.data?.items ?? json.items ?? [];

        setReviews(items.map((r): Review => {
          const reviewer = Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer;
          const name = reviewer?.full_name || 'Student';
          return {
            id: r.id,
            reviewer_id: r.reviewer_id,
            authorName: name,
            authorAvatar: reviewer?.avatar_url ?? null,
            authorInitials: name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
            authorHue: hueFromName(name),
            body: r.comment ?? null,
            rating: r.rating,
            createdAt: formatRelative(r.created_at),
            tutor_reply: r.tutor_reply ?? null,
            tutor_replied_at: r.tutor_replied_at ?? null,
          };
        }));

        if (profile?.id) {
          const already = items.some((r: any) => r.reviewer_id === profile.id);
          setAlreadyReviewed(already);
          if (!already) {
            // Check if student is enrolled (enrollment OR approved group_members row)
            const [{ data: enrollment }, { data: membership }] = await Promise.all([
              supabase.from('group_enrollments').select('id').eq('group_id', targetId).eq('student_id', profile.id).in('status', ['ACTIVE', 'GRACE']).maybeSingle(),
              supabase.from('group_members').select('id').eq('group_id', targetId).eq('user_id', profile.id).in('status', ['approved', 'active']).maybeSingle(),
            ]);
            setEligibleSessionId(enrollment || membership ? 'eligible' : null);
          } else {
            setEligibleSessionId(null);
          }
        } else {
          setEligibleSessionId(null);
        }
      } else {
        // 1:1 tutor ratings
        const { data } = await supabase
          .from('ratings')
          .select('id, comment, stars, created_at, tutor_reply, tutor_replied_at, student_id, student:profiles!ratings_student_id_fkey(full_name, avatar_url)')
          .eq('tutor_id', targetId)
          .not('comment', 'is', null)
          .order('created_at', { ascending: false })
          .limit(100);

        setReviews((data ?? []).map((r: any): Review => {
          const s = Array.isArray(r.student) ? r.student[0] : r.student;
          const name = s?.full_name || 'Student';
          return {
            id: r.id,
            reviewer_id: r.student_id ?? '',
            authorName: name,
            authorAvatar: s?.avatar_url ?? null,
            authorInitials: name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
            authorHue: hueFromName(name),
            body: r.comment,
            rating: r.stars,
            createdAt: formatRelative(r.created_at),
            tutor_reply: r.tutor_reply ?? null,
            tutor_replied_at: r.tutor_replied_at ?? null,
          };
        }));
        setEligibleSessionId(null);
      }
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [targetId, targetKind, profile?.id]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const submitReview = async () => {
    if (newRating === 0 || submitting || !eligibleSessionId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/groups/${targetId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: newRating, comment: newComment.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? json.message ?? 'Failed to submit review');
      setNewRating(0);
      setNewComment('');
      setAlreadyReviewed(true);
      await fetchReviews();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const saveEdit = async (id: string) => {
    if (!editDraft.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: editDraft.trim() }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setReviews(reviews.map(r => r.id === id ? { ...r, body: editDraft.trim() } : r));
      setEditingId(null);
    } catch {}
    finally { setEditSaving(false); }
  };

  const deleteReview = async (id: string) => {
    if (!confirm('Delete your review? This cannot be undone.')) return;
    try {
      await fetch(`/api/reviews/${id}`, { method: 'DELETE' });
      setReviews(reviews.filter(r => r.id !== id));
      setAlreadyReviewed(false);
      setEligibleSessionId(null); // re-enable submission
    } catch {}
  };

  const submitReply = async (reviewId: string) => {
    if (!replyDraft.trim() || replySaving) return;
    setReplySaving(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/reply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: replyDraft.trim() }),
      });
      if (!res.ok) throw new Error('Failed to post reply');
      setReviews(reviews.map(r => r.id === reviewId ? { ...r, tutor_reply: replyDraft.trim(), tutor_replied_at: new Date().toISOString() } : r));
      setReplyingId(null);
      setReplyDraft('');
    } catch {}
    finally { setReplySaving(false); }
  };

  const saveReplyEdit = async (reviewId: string) => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}/reply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: replyEditDraft.trim() }),
      });
      if (!res.ok) throw new Error('Failed to update reply');
      setReviews(reviews.map(r => r.id === reviewId ? { ...r, tutor_reply: replyEditDraft.trim() } : r));
      setEditingReplyId(null);
    } catch {}
  };

  const deleteReply = async (reviewId: string) => {
    try {
      await fetch(`/api/reviews/${reviewId}/reply`, { method: 'DELETE' });
      setReviews(reviews.map(r => r.id === reviewId ? { ...r, tutor_reply: null, tutor_replied_at: null } : r));
    } catch {}
  };

  const filtered = activeRatingFilter == null ? reviews : reviews.filter(r => r.rating === activeRatingFilter);
  const visible = filtered.slice(0, shown);
  const isStudent = profile?.role === 'student';
  const canSubmit = targetKind === 'class' && isStudent && viewerLoggedIn && !viewerIsOwnerTutor && !alreadyReviewed && eligibleSessionId != null;

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading reviews…</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-ink text-lg">
          Reviews <span className="text-muted-foreground font-normal text-base">({reviews.length})</span>
        </h3>
        {activeRatingFilter != null && (
          <button onClick={onClearFilter}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-brand/10 text-brand-deep hover:bg-brand/20">
            {activeRatingFilter}★ only <X className="size-3" />
          </button>
        )}
      </div>

      {/* New review form */}
      {canSubmit && (
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="text-sm font-semibold text-ink">Leave a review</div>
          <StarInput value={newRating} onChange={setNewRating} size={36} />
          {newRating > 0 && (
            <>
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Share your experience (optional)"
                rows={3}
                maxLength={1000}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{newComment.length}/1000</span>
                <div className="flex gap-2">
                  <button onClick={() => { setNewRating(0); setNewComment(''); }}
                    className="px-3 py-1.5 text-sm text-muted-foreground hover:text-ink">Cancel</button>
                  <button onClick={submitReview} disabled={submitting}
                    className="px-5 py-1.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
                    {submitting ? 'Submitting…' : 'Submit Review'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* State messages */}
      {alreadyReviewed && isStudent && !viewerIsOwnerTutor && (
        <p className="text-sm text-muted-foreground italic">You've already reviewed this class.</p>
      )}
      {targetKind === 'class' && isStudent && !viewerIsOwnerTutor && !alreadyReviewed && eligibleSessionId === null && viewerLoggedIn && (
        <p className="text-sm text-muted-foreground">Attend a session to leave a review.</p>
      )}

      {/* Reviews list */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {activeRatingFilter != null ? `No ${activeRatingFilter}-star reviews yet.` : 'No reviews yet. Be the first to share your experience.'}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(r => {
            const isOwn = r.reviewer_id === profile?.id;
            return (
              <article key={r.id} className="rounded-2xl bg-card border border-border p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar name={r.authorName} hue={r.authorHue} avatar={r.authorAvatar} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink text-sm">{r.authorName}</span>
                      <StarRow value={r.rating} size={13} />
                      <span className="text-[11px] text-muted-foreground">{r.createdAt}</span>
                    </div>

                    {editingId === r.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={3} maxLength={1000}
                          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm text-muted-foreground">Cancel</button>
                          <button onClick={() => saveEdit(r.id)} disabled={editSaving || !editDraft.trim()}
                            className="px-4 py-1.5 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-50">
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      r.body && <p className="text-sm text-ink/90 mt-1 whitespace-pre-wrap">{r.body}</p>
                    )}
                  </div>
                </div>

                {/* Action bar */}
                <div className="flex items-center gap-3 flex-wrap pl-[52px]">
                  <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-deep transition">
                    <ThumbsUp className="size-3.5" />
                  </button>
                  <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-rose-500 transition">
                    <ThumbsDown className="size-3.5" />
                  </button>
                  <div className="flex-1" />
                  {viewerIsOwnerTutor && !r.tutor_reply && replyingId !== r.id && (
                    <button onClick={() => { setReplyingId(r.id); setReplyDraft(''); }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
                      <MessageSquare className="size-3" /> Reply
                    </button>
                  )}
                  {isOwn && editingId !== r.id && (
                    <>
                      <button onClick={() => { setEditingId(r.id); setEditDraft(r.body ?? ''); }}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-ink">
                        <Pencil className="size-3" /> Edit
                      </button>
                      <button onClick={() => deleteReview(r.id)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3" /> Delete
                      </button>
                    </>
                  )}
                </div>

                {/* Reply input */}
                {replyingId === r.id && (
                  <div className="ml-[52px] pl-3 border-l-2 border-brand/30 space-y-2">
                    <textarea value={replyDraft} onChange={e => setReplyDraft(e.target.value)}
                      placeholder="Write a public reply…" rows={2} maxLength={1000}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setReplyingId(null)} className="px-3 py-1.5 text-sm text-muted-foreground">Cancel</button>
                      <button onClick={() => submitReply(r.id)} disabled={!replyDraft.trim() || replySaving}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-50">
                        <Send className="size-3.5" /> {replySaving ? 'Posting…' : 'Post Reply'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Existing tutor reply */}
                {r.tutor_reply && (
                  <div className="ml-[52px] rounded-xl bg-brand/5 border-l-2 border-brand p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-bold text-brand-deep uppercase tracking-wider">Tutor Reply</span>
                      {viewerIsOwnerTutor && editingReplyId !== r.id && (
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingReplyId(r.id); setReplyEditDraft(r.tutor_reply ?? ''); }}
                            className="text-xs text-muted-foreground hover:text-ink inline-flex items-center gap-0.5">
                            <Pencil className="size-3" /> Edit
                          </button>
                          <button onClick={() => deleteReply(r.id)}
                            className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-0.5">
                            <Trash2 className="size-3" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                    {editingReplyId === r.id ? (
                      <div className="space-y-2">
                        <textarea value={replyEditDraft} onChange={e => setReplyEditDraft(e.target.value)} rows={2}
                          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none" />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingReplyId(null)} className="px-3 py-1.5 text-sm text-muted-foreground">Cancel</button>
                          <button onClick={() => saveReplyEdit(r.id)}
                            className="px-4 py-1.5 rounded-xl bg-brand text-white text-sm font-semibold">Save</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-ink/80 italic whitespace-pre-wrap">{r.tutor_reply}</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {filtered.length > shown && (
        <button onClick={() => setShown(n => n + PAGE)}
          className="w-full py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted text-muted-foreground">
          Load more ({filtered.length - shown} remaining)
        </button>
      )}
    </div>
  );
}

function formatRelative(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 3600000) return `${Math.max(1, Math.round(diff / 60000))}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.round(diff / 86400000)}d ago`;
  if (diff < 2592000000) return `${Math.round(diff / 604800000)}w ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
