'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Search, MessageSquare, Send, Pencil, Trash2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';
import { StarRow } from '@/components/ratings/StarInput';

/* ─── Types ─────────────────────────────────────────── */

type OneOnOneReview = {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  studentName: string;
  studentAvatar: string | null;
  studentInitials: string;
  subject: string | null;
  tutor_reply: string | null;
  tutor_replied_at: string | null;
};

type GroupReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewerName: string;
  reviewerAvatar: string | null;
  reviewerInitials: string;
  groupName: string;
  groupId: string;
  tutor_reply: string | null;
  tutor_replied_at: string | null;
};

type Tab = '1on1' | 'group';

/* ─── Page shell ─────────────────────────────────────── */

export default function TutorReviewsPage() {
  return (
    <TutorShell>
      <ReviewsContent />
    </TutorShell>
  );
}

/* ─── Main content ───────────────────────────────────── */

function ReviewsContent() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [tab, setTab] = useState<Tab>('1on1');
  const [oneOnOneReviews, setOneOnOneReviews] = useState<OneOnOneReview[]>([]);
  const [groupReviews, setGroupReviews] = useState<GroupReview[]>([]);
  const [filter, setFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1' | 'unreplied'>('all');
  const [search, setSearch] = useState('');
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchAll(profile.id);
  }, [profile?.id]);

  async function fetchAll(tutorId: string) {
    setDataLoading(true);
    try {
      const [{ data: ratings }, { data: groupRaw }] = await Promise.all([
        supabase
          .from('ratings')
          .select('id, stars, comment, created_at, tutor_reply, tutor_replied_at, student:profiles!ratings_student_id_fkey(full_name, avatar_url), session:sessions(booking:bookings(subjects(label,name)))')
          .eq('tutor_id', tutorId)
          .order('created_at', { ascending: false }),
        supabase
          .from('group_reviews')
          .select('id, rating, comment, created_at, tutor_reply, tutor_replied_at, reviewer_id, group_id, reviewer:profiles!group_reviews_reviewer_id_fkey(full_name, avatar_url), group:groups!group_reviews_group_id_fkey(id, name)')
          .eq('tutor_id', tutorId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);

      setOneOnOneReviews((ratings ?? []).map((r: any): OneOnOneReview => {
        const s = Array.isArray(r.student) ? r.student[0] : r.student;
        const session = Array.isArray(r.session) ? r.session[0] : r.session;
        const booking = session?.booking ? (Array.isArray(session.booking) ? session.booking[0] : session.booking) : null;
        const subject = booking?.subjects ? (Array.isArray(booking.subjects) ? booking.subjects[0] : booking.subjects) : null;
        const name = s?.full_name || 'Anonymous';
        return {
          id: r.id, stars: r.stars, comment: r.comment, created_at: r.created_at,
          studentName: name,
          studentAvatar: s?.avatar_url ?? null,
          studentInitials: name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
          subject: subject?.label || subject?.name || null,
          tutor_reply: r.tutor_reply ?? null,
          tutor_replied_at: r.tutor_replied_at ?? null,
        };
      }));

      setGroupReviews((groupRaw ?? []).map((r: any): GroupReview => {
        const rev = Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer;
        const grp = Array.isArray(r.group) ? r.group[0] : r.group;
        const name = rev?.full_name || 'Student';
        return {
          id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at,
          reviewerName: name,
          reviewerAvatar: rev?.avatar_url ?? null,
          reviewerInitials: name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
          groupName: grp?.name || 'Class',
          groupId: r.group_id,
          tutor_reply: r.tutor_reply ?? null,
          tutor_replied_at: r.tutor_replied_at ?? null,
        };
      }));
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setDataLoading(false);
    }
  }

  const updateReply = (id: string, reply: string | null) => {
    if (tab === '1on1') setOneOnOneReviews(rs => rs.map(r => r.id === id ? { ...r, tutor_reply: reply, tutor_replied_at: reply ? new Date().toISOString() : null } : r));
    else setGroupReviews(rs => rs.map(r => r.id === id ? { ...r, tutor_reply: reply, tutor_replied_at: reply ? new Date().toISOString() : null } : r));
  };

  const allReviews = tab === '1on1' ? oneOnOneReviews : groupReviews;
  const stars = allReviews.map(r => ('stars' in r ? r.stars : r.rating));

  const stats = useMemo(() => {
    const total = stars.length;
    const avg = total ? stars.reduce((s, n) => s + n, 0) / total : 0;
    const dist = [5, 4, 3, 2, 1].map(s => ({ star: s, count: stars.filter(n => n === s).length, pct: total ? (stars.filter(n => n === s).length / total) * 100 : 0 }));
    const replied = allReviews.filter(r => r.tutor_reply).length;
    return { total, avg, dist, responseRate: total ? Math.round((replied / total) * 100) : 0 };
  }, [allReviews, stars]);

  const filtered = useMemo(() => {
    return allReviews.filter(r => {
      const rStars = 'stars' in r ? r.stars : r.rating;
      if (filter !== 'all' && filter !== 'unreplied' && rStars !== Number(filter)) return false;
      if (filter === 'unreplied' && r.tutor_reply) return false;
      const name = 'studentName' in r ? r.studentName : r.reviewerName;
      if (search && !(r.comment?.toLowerCase().includes(search.toLowerCase()) || name.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [allReviews, filter, search]);

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">Reviews</h1>
        <p className="text-sm text-muted-foreground mt-1">Feedback from your students.</p>
      </header>

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-border bg-card p-1 text-sm font-semibold">
        {([['1on1', '1:1 Sessions'], ['group', 'Group Classes']] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setFilter('all'); setSearch(''); }}
            className={cn('px-4 py-2 rounded-lg transition', tab === key ? 'bg-ink text-white' : 'text-muted-foreground hover:text-ink')}>
            {label}
            <span className={cn('ml-1.5 text-[11px]', tab === key ? 'text-white/70' : 'text-muted-foreground')}>
              ({key === '1on1' ? oneOnOneReviews.length : groupReviews.length})
            </span>
          </button>
        ))}
      </div>

      {/* Stats header */}
      <section className="grid lg:grid-cols-[220px_1fr] gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-white p-6 flex flex-col justify-center">
          <div className="text-5xl font-extrabold tabular-nums">{stats.avg.toFixed(1)}</div>
          <div className="mt-2 flex gap-0.5">
            {[1,2,3,4,5].map(s => <Star key={s} className={cn('size-4', stats.avg >= s ? 'fill-yellow-300 text-yellow-300' : 'text-white/25')} />)}
          </div>
          <div className="text-sm text-white/75 mt-2">{stats.total} review{stats.total !== 1 ? 's' : ''}</div>
          <div className="text-sm text-white/75">{stats.responseRate}% response rate</div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-5 grid sm:grid-cols-2 gap-6">
          <div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Distribution</div>
            <div className="space-y-1.5">
              {stats.dist.map(d => (
                <div key={d.star} className="flex items-center gap-2 text-xs">
                  <div className="w-8 text-muted-foreground tabular-nums">{d.star}★</div>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${d.pct}%` }} />
                  </div>
                  <div className="w-6 text-right text-ink font-semibold tabular-nums">{d.count}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1">
              <TrendingUp className="size-3" /> Trend (6mo)
            </div>
            <div className="h-28 flex items-end gap-1.5">
              {[4.6, 4.7, 4.5, 4.8, 4.9, stats.avg || 4.8].map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-gradient-to-t from-brand to-emerald-300 rounded-t" style={{ height: `${(v / 5) * 100}%` }} />
                  <div className="text-[9px] text-muted-foreground">{['D','J','F','M','A','M'][i]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reviews…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-1 text-xs font-semibold flex-wrap">
          {(['all', 'unreplied', '5', '4', '3', '2', '1'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-2.5 py-1.5 rounded-md transition capitalize',
                filter === f ? 'bg-ink text-white' : 'text-muted-foreground hover:text-ink')}>
              {f === 'all' ? 'All' : f === 'unreplied' ? 'Unreplied' : `${f}★`}
            </button>
          ))}
        </div>
      </div>

      {/* Review list */}
      {dataLoading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading reviews…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Star className="size-8 mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">
            {allReviews.length === 0 ? 'No reviews yet. Students will appear here after rating sessions.' : 'No reviews match your filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <ReviewCard key={r.id} review={r} onReplyChange={updateReply} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Review card ────────────────────────────────────── */

function ReviewCard({ review, onReplyChange }: {
  review: OneOnOneReview | GroupReview;
  onReplyChange: (id: string, reply: string | null) => void;
}) {
  const isOneOnOne = 'stars' in review;
  const stars = isOneOnOne ? review.stars : review.rating;
  const name = isOneOnOne ? review.studentName : review.reviewerName;
  const avatar = isOneOnOne ? review.studentAvatar : review.reviewerAvatar;
  const initials = isOneOnOne ? review.studentInitials : review.reviewerInitials;
  const meta = isOneOnOne ? review.subject : (review as GroupReview).groupName;

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [editingReply, setEditingReply] = useState(false);
  const [replyEditText, setReplyEditText] = useState('');
  const [saving, setSaving] = useState(false);

  const submitReply = async () => {
    if (!replyText.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reviews/${review.id}/reply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      onReplyChange(review.id, replyText.trim());
      setReplyOpen(false);
      setReplyText('');
    } catch {}
    finally { setSaving(false); }
  };

  const saveReplyEdit = async () => {
    if (!replyEditText.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reviews/${review.id}/reply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: replyEditText.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      onReplyChange(review.id, replyEditText.trim());
      setEditingReply(false);
    } catch {}
    finally { setSaving(false); }
  };

  const deleteReply = async () => {
    try {
      await fetch(`/api/reviews/${review.id}/reply`, { method: 'DELETE' });
      onReplyChange(review.id, null);
    } catch {}
  };

  return (
    <article className="rounded-2xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full bg-brand/15 text-brand-deep grid place-items-center text-sm font-bold shrink-0 overflow-hidden">
          {avatar ? <img src={avatar} alt={name} className="size-10 object-cover" /> : initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="font-semibold text-ink">{name}</span>
              {meta && <span className="text-xs text-muted-foreground ml-2">· {meta}</span>}
            </div>
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map(s => <Star key={s} className={cn('size-3.5', stars >= s ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20')} />)}
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(review.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      {review.comment && <p className="text-sm text-ink/90 whitespace-pre-wrap pl-[52px]">{review.comment}</p>}

      {/* Reply section */}
      <div className="pl-[52px] space-y-2">
        {review.tutor_reply ? (
          <div className="rounded-xl bg-brand/5 border-l-2 border-brand p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-brand-deep uppercase tracking-wider">Your Reply</span>
              {!editingReply && (
                <div className="flex gap-3">
                  <button onClick={() => { setEditingReply(true); setReplyEditText(review.tutor_reply ?? ''); }}
                    className="text-xs text-muted-foreground hover:text-ink inline-flex items-center gap-0.5">
                    <Pencil className="size-3" /> Edit
                  </button>
                  <button onClick={deleteReply}
                    className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-0.5">
                    <Trash2 className="size-3" /> Delete
                  </button>
                </div>
              )}
            </div>
            {editingReply ? (
              <>
                <textarea value={replyEditText} onChange={e => setReplyEditText(e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingReply(false)} className="px-3 py-1.5 text-sm text-muted-foreground">Cancel</button>
                  <button onClick={saveReplyEdit} disabled={saving || !replyEditText.trim()}
                    className="px-4 py-1.5 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink/80 italic">{review.tutor_reply}</p>
            )}
          </div>
        ) : replyOpen ? (
          <div className="space-y-2">
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)} maxLength={1000} rows={2}
              placeholder="Write a public reply…"
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{replyText.length}/1000</span>
              <div className="flex gap-2">
                <button onClick={() => { setReplyOpen(false); setReplyText(''); }} className="px-3 py-1.5 font-semibold hover:text-ink">Cancel</button>
                <button onClick={submitReply} disabled={!replyText.trim() || saving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-brand text-white font-semibold disabled:opacity-50">
                  <Send className="size-3.5" /> {saving ? 'Posting…' : 'Post reply'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button onClick={() => setReplyOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:underline">
            <MessageSquare className="size-4" /> Reply publicly
          </button>
        )}
      </div>
    </article>
  );
}
