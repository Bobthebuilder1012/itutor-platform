'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { StarRow } from '@/components/ratings/StarInput';

type OneOnOneRating = {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  tutorName: string;
  tutorAvatar: string | null;
  tutorInitials: string;
  tutor_reply: string | null;
};

type GroupRating = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  groupName: string;
  tutorName: string;
  tutorAvatar: string | null;
  tutorInitials: string;
  tutor_reply: string | null;
};

type Tab = '1on1' | 'group';

export default function StudentRatings() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('1on1');
  const [oneOnOne, setOneOnOne] = useState<OneOnOneRating[]>([]);
  const [group, setGroup] = useState<GroupRating[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'student') { router.push('/login'); return; }
    fetchAll(profile.id);
  }, [profile, loading, router]);

  async function fetchAll(studentId: string) {
    setDataLoading(true);
    try {
      const [{ data: ratings }, { data: groupReviews }] = await Promise.all([
        supabase
          .from('ratings')
          .select('id, stars, comment, created_at, tutor_reply, tutor:profiles!ratings_tutor_id_fkey(full_name, avatar_url)')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false }),
        supabase
          .from('group_reviews')
          .select('id, rating, comment, created_at, tutor_reply, group:groups!group_reviews_group_id_fkey(id, name, tutor:profiles!groups_tutor_id_fkey(full_name, avatar_url))')
          .eq('reviewer_id', studentId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);

      // Dedupe 1:1 ratings by tutor (latest per tutor)
      const seen = new Set<string>();
      setOneOnOne((ratings ?? []).filter((r: any) => {
        const tutorId = typeof r.tutor === 'object' && !Array.isArray(r.tutor) ? r.tutor?.id : (Array.isArray(r.tutor) ? r.tutor[0]?.id : null);
        if (tutorId && seen.has(tutorId)) return false;
        if (tutorId) seen.add(tutorId);
        return true;
      }).map((r: any): OneOnOneRating => {
        const t = Array.isArray(r.tutor) ? r.tutor[0] : r.tutor;
        const name = t?.full_name || 'Tutor';
        return {
          id: r.id, stars: r.stars, comment: r.comment, created_at: r.created_at,
          tutorName: name,
          tutorAvatar: t?.avatar_url ?? null,
          tutorInitials: name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
          tutor_reply: r.tutor_reply ?? null,
        };
      }));

      setGroup((groupReviews ?? []).map((r: any): GroupRating => {
        const grp = Array.isArray(r.group) ? r.group[0] : r.group;
        const tutor = grp?.tutor ? (Array.isArray(grp.tutor) ? grp.tutor[0] : grp.tutor) : null;
        const tutorName = tutor?.full_name || 'Tutor';
        return {
          id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at,
          groupName: grp?.name || 'Class',
          tutorName,
          tutorAvatar: tutor?.avatar_url ?? null,
          tutorInitials: tutorName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
          tutor_reply: r.tutor_reply ?? null,
        };
      }));
    } catch (err) {
      console.error('Failed to load ratings:', err);
    } finally {
      setDataLoading(false);
    }
  }

  const current = tab === '1on1' ? oneOnOne : group;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-ink">My Reviews</h1>
          <p className="text-sm text-muted-foreground mt-1">Reviews you've left for tutors and classes.</p>
        </header>

        {/* Tabs */}
        <div className="inline-flex rounded-xl border border-border bg-card p-1 text-sm font-semibold">
          {([['1on1', '1:1 Sessions'], ['group', 'Group Classes']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn('px-4 py-2 rounded-lg transition', tab === key ? 'bg-ink text-white' : 'text-muted-foreground hover:text-ink')}>
              {label}
              <span className={cn('ml-1.5 text-[11px]', tab === key ? 'text-white/70' : 'text-muted-foreground')}>
                ({key === '1on1' ? oneOnOne.length : group.length})
              </span>
            </button>
          ))}
        </div>

        {dataLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : current.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
            <Star className="size-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-semibold text-ink">No reviews yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              {tab === '1on1' ? 'Rate a 1:1 session to see it here.' : 'Review a group class to see it here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tab === '1on1'
              ? oneOnOne.map(r => <OneOnOneCard key={r.id} r={r} />)
              : group.map(r => <GroupCard key={r.id} r={r} />)
            }
          </div>
        )}
      </div>
  );
}

function OneOnOneCard({ r }: { r: OneOnOneRating }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full bg-brand/15 text-brand-deep grid place-items-center text-sm font-bold shrink-0 overflow-hidden">
          {r.tutorAvatar ? <img src={r.tutorAvatar} alt={r.tutorName} className="size-10 object-cover" /> : r.tutorInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-semibold text-ink">{r.tutorName}</span>
            <StarRow value={r.stars} size={14} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(r.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>
      {r.comment && <p className="text-sm text-ink/90 pl-[52px]">{r.comment}</p>}
      {r.tutor_reply && (
        <div className="ml-[52px] rounded-xl bg-brand/5 border-l-2 border-brand p-3">
          <div className="text-[11px] font-bold text-brand-deep uppercase tracking-wider mb-1 flex items-center gap-1">
            <MessageSquare className="size-3" /> Tutor Reply
          </div>
          <p className="text-sm text-ink/80 italic">{r.tutor_reply}</p>
        </div>
      )}
    </article>
  );
}

function GroupCard({ r }: { r: GroupRating }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full bg-brand/15 text-brand-deep grid place-items-center text-sm font-bold shrink-0 overflow-hidden">
          {r.tutorAvatar ? <img src={r.tutorAvatar} alt={r.tutorName} className="size-10 object-cover" /> : r.tutorInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="font-semibold text-ink">{r.groupName}</span>
              <span className="text-xs text-muted-foreground ml-1.5">· {r.tutorName}</span>
            </div>
            <StarRow value={r.rating} size={14} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(r.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>
      {r.comment && <p className="text-sm text-ink/90 pl-[52px]">{r.comment}</p>}
      {r.tutor_reply && (
        <div className="ml-[52px] rounded-xl bg-brand/5 border-l-2 border-brand p-3">
          <div className="text-[11px] font-bold text-brand-deep uppercase tracking-wider mb-1 flex items-center gap-1">
            <MessageSquare className="size-3" /> Tutor Reply
          </div>
          <p className="text-sm text-ink/80 italic">{r.tutor_reply}</p>
        </div>
      )}
    </article>
  );
}
