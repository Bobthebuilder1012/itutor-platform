'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Search, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type Review = {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  studentName: string;
  studentAvatar: string | null;
  subject: string | null;
};

export default function TutorReviewsPage() {
  return (
    <TutorShell>
      <ReviewsContent />
    </TutorShell>
  );
}

function ReviewsContent() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1'>('all');
  const [search, setSearch] = useState('');
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchReviews(profile.id);
  }, [profile?.id]);

  async function fetchReviews(tutorId: string) {
    setDataLoading(true);
    try {
      const { data } = await supabase
        .from('ratings')
        .select('id, stars, comment, created_at, student:profiles!ratings_student_id_fkey(full_name, display_name, avatar_url), session:sessions(booking:bookings(subjects(label, name)))')
        .eq('tutor_id', tutorId)
        .order('created_at', { ascending: false });
      const mapped: Review[] = (data ?? []).map((r: any) => {
        const student = Array.isArray(r.student) ? r.student[0] : r.student;
        const session = Array.isArray(r.session) ? r.session[0] : r.session;
        const booking = session?.booking ? (Array.isArray(session.booking) ? session.booking[0] : session.booking) : null;
        const subject = booking?.subjects ? (Array.isArray(booking.subjects) ? booking.subjects[0] : booking.subjects) : null;
        return {
          id: r.id,
          stars: r.stars,
          comment: r.comment,
          created_at: r.created_at,
          studentName: student?.display_name || student?.full_name || 'Anonymous',
          studentAvatar: student?.avatar_url ?? null,
          subject: subject?.label || subject?.name || null,
        };
      });
      setReviews(mapped);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setDataLoading(false);
    }
  }

  const stats = useMemo(() => {
    const total = reviews.length;
    const avg = total ? reviews.reduce((s, r) => s + r.stars, 0) / total : 0;
    const dist = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((r) => r.stars === star).length,
      pct: total ? (reviews.filter((r) => r.stars === star).length / total) * 100 : 0,
    }));
    return { total, avg, dist };
  }, [reviews]);

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (filter !== 'all' && r.stars !== Number(filter)) return false;
      if (search && !(r.comment?.toLowerCase().includes(search.toLowerCase()) || r.studentName.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [reviews, filter, search]);

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">Reviews</h1>
        <p className="text-sm text-muted-foreground mt-1">Feedback from your students.</p>
      </header>

      <section className="rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-white p-6 grid sm:grid-cols-[160px_1fr] gap-6">
        <div className="text-center">
          <div className="text-4xl font-bold tabular-nums">{stats.avg.toFixed(1)}</div>
          <div className="mt-1 flex justify-center">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star key={s} className={cn('size-4', stats.avg >= s ? 'fill-yellow-300 text-yellow-300' : 'text-white/30')} />
            ))}
          </div>
          <div className="text-sm text-white/80 mt-1">{stats.total} review{stats.total === 1 ? '' : 's'}</div>
        </div>
        <div className="space-y-1.5">
          {stats.dist.map((d) => (
            <div key={d.star} className="flex items-center gap-3 text-sm">
              <span className="w-3 tabular-nums">{d.star}</span>
              <Star className="size-3 fill-white text-white" />
              <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full" style={{ width: `${d.pct}%` }} />
              </div>
              <span className="text-xs text-white/80 tabular-nums w-8 text-right">{d.count}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reviews…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-1 text-xs font-semibold">
          {(['all', '5', '4', '3', '2', '1'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-2.5 py-1.5 rounded-md transition', filter === f ? 'bg-ink text-white' : 'text-muted-foreground hover:text-ink')}>
              {f === 'all' ? 'All' : `${f}★`}
            </button>
          ))}
        </div>
      </div>

      {dataLoading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading reviews…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Star className="size-8 mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">{reviews.length === 0 ? 'No reviews yet. Once your students rate sessions, their feedback will appear here.' : 'No reviews match your filter.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => <ReviewCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ r }: { r: Review }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full bg-coral/20 text-coral grid place-items-center text-sm font-semibold overflow-hidden shrink-0">
          {r.studentAvatar ? <img src={r.studentAvatar} alt="" className="size-10 rounded-full object-cover" /> : r.studentName.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="font-semibold text-ink">{r.studentName}</div>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className={cn('size-3.5', r.stars >= s ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30')} />
              ))}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {r.subject && <span>{r.subject} · </span>}
            {new Date(r.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          {r.comment && <p className="text-sm text-ink mt-3 whitespace-pre-line">{r.comment}</p>}
        </div>
      </div>
    </article>
  );
}
