'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Star, Users, GraduationCap, Sparkles, Flame, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { supabase } from '@/lib/supabase/client';
import { parseScheduleData, scheduleToDisplay } from '@/lib/utils/scheduleFormat';
import ParentShell from '@/components/parent/ParentShell';

type TabType = 'classes' | 'tutors';

type TutorListing = {
  id: string; full_name: string | null; display_name: string | null; username: string | null;
  avatar_url: string | null; bio: string | null; average_rating: number | null; total_reviews: number;
  subjects: { name: string; label: string; price_per_hour_ttd: number }[];
};

type GroupListing = {
  id: string; name: string; subject: string | null; form_level: string | null;
  cover_image: string | null; price_monthly: number | null; max_students: number;
  require_join_requests: boolean; feedback_mode: string | null; parent_feedback_price: number | null;
  schedule_display: string | null; schedule_data: string | null;
  average_rating: number | null; status: string | null;
  tutor: { full_name: string | null; display_name: string | null; rating_average: number | null } | null;
  member_count: number;
};

const SUBJECT_CHIPS = ['All', 'Maths', 'English', 'Physics', 'Chemistry', 'Biology', 'SEA', 'Accounts'];

const GRADIENTS = [
  'from-brand to-emerald-400', 'from-sky-500 to-cyan-400', 'from-orange-500 to-amber-400',
  'from-fuchsia-500 to-purple-500', 'from-rose-500 to-pink-400', 'from-indigo-500 to-blue-500',
];

function gradientFor(name: string) {
  return GRADIENTS[Math.abs([...name].reduce((a, c) => a + c.charCodeAt(0), 0)) % GRADIENTS.length];
}

export default function ParentClassesPage() {
  return <ParentShell><ClassesContent /></ParentShell>;
}

function ClassesContent() {
  const [tab, setTab] = useState<TabType>('classes');
  const [groups, setGroups] = useState<GroupListing[]>([]);
  const [tutors, setTutors] = useState<TutorListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeChip, setActiveChip] = useState('All');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('groups')
        .select(`
          id, name, subject, form_level, cover_image, price_monthly, max_students,
          require_join_requests, feedback_mode, parent_feedback_price,
          schedule_display, schedule_data, status,
          tutor:profiles!groups_tutor_id_fkey(full_name, display_name, rating_average)
        `)
        .or('status.eq.PUBLISHED,status.is.null')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(60);

      // Get member counts
      const ids = (data ?? []).map((g: any) => g.id);
      let countMap: Record<string, number> = {};
      if (ids.length) {
        const { data: counts } = await supabase
          .from('group_members')
          .select('group_id')
          .in('group_id', ids)
          .in('status', ['approved', 'active']);
        (counts ?? []).forEach((m: any) => { countMap[m.group_id] = (countMap[m.group_id] ?? 0) + 1; });
      }

      setGroups((data ?? []).map((g: any) => ({
        ...g,
        tutor: Array.isArray(g.tutor) ? g.tutor[0] : g.tutor,
        member_count: countMap[g.id] ?? 0,
      })));

      // Fetch 1:1 tutors
      const { data: tutorProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, username, avatar_url, bio, average_rating')
        .eq('role', 'tutor')
        .eq('tutor_verification_status', 'VERIFIED')
        .or('pause_1on1.is.null,pause_1on1.eq.false')
        .limit(40);

      // Get subjects for tutors
      const tutorIds = (tutorProfiles ?? []).map((t: any) => t.id);
      const { data: subjects } = await supabase
        .from('tutor_subjects')
        .select('tutor_id, subject:subjects(name, label), price_per_hour_ttd')
        .in('tutor_id', tutorIds);

      const subjectsByTutor = new Map<string, any[]>();
      (subjects ?? []).forEach((s: any) => {
        const sub = Array.isArray(s.subject) ? s.subject[0] : s.subject;
        const arr = subjectsByTutor.get(s.tutor_id) ?? [];
        arr.push({ name: sub?.name, label: sub?.label || sub?.name, price_per_hour_ttd: s.price_per_hour_ttd });
        subjectsByTutor.set(s.tutor_id, arr);
      });

      setTutors((tutorProfiles ?? []).map((t: any) => ({
        ...t,
        total_reviews: 0,
        subjects: subjectsByTutor.get(t.id) ?? [],
      })));
      setLoading(false);
    })();
  }, []);

  const matchChip = (subject: string | null) => {
    if (activeChip === 'All') return true;
    const s = (subject || '').toLowerCase();
    if (activeChip === 'Maths') return s.includes('math');
    if (activeChip === 'SEA') return s.includes('sea');
    return s.includes(activeChip.toLowerCase());
  };

  const filtered = groups.filter(g =>
    matchChip(g.subject) &&
    (!query || g.name.toLowerCase().includes(query.toLowerCase()) ||
      (g.subject || '').toLowerCase().includes(query.toLowerCase()) ||
      (g.tutor?.display_name || g.tutor?.full_name || '').toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Marketplace</div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-1">Find tutors & classes</h1>
        <p className="text-sm text-muted-foreground mt-1">Browse on behalf of your children and enroll them directly.</p>
      </div>

      {/* Tab switcher */}
      <div className="inline-flex p-1 rounded-2xl bg-muted">
        <button onClick={() => setTab('classes')}
          className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition', tab === 'classes' ? 'bg-background text-ink shadow-sm' : 'text-muted-foreground hover:text-ink')}>
          <Users className="size-4" /> Group Classes
        </button>
        <button onClick={() => setTab('tutors')}
          className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition', tab === 'tutors' ? 'bg-background text-ink shadow-sm' : 'text-muted-foreground hover:text-ink')}>
          <UserCheck className="size-4" /> 1:1 Tutors
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search classes, tutors, subjects…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
      </div>

      {/* Subject chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {SUBJECT_CHIPS.map(c => (
          <button key={c} onClick={() => setActiveChip(c)}
            className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition',
              activeChip === c ? 'bg-ink text-white border-ink' : 'bg-background border-border text-muted-foreground hover:border-brand')}>
            {c}
          </button>
        ))}
      </div>

      {tab === 'classes' && (
        loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-64 rounded-2xl bg-muted animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
            <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><GraduationCap className="size-5"/></div>
            <h2 className="font-bold text-ink">No classes match</h2>
            <p className="text-sm text-muted-foreground mt-1">Try a different subject or clear your search.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(g => <ClassCard key={g.id} g={g} />)}
          </div>
        )
      )}

      {tab === 'tutors' && (
        loading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />)}
          </div>
        ) : tutors.filter(t =>
            !query || (t.display_name || t.full_name || '').toLowerCase().includes(query.toLowerCase()) ||
            t.subjects.some(s => (s.name || '').toLowerCase().includes(query.toLowerCase()))
          ).length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
            <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><UserCheck className="size-5"/></div>
            <h2 className="font-bold text-ink">No tutors found</h2>
            <p className="text-sm text-muted-foreground mt-1">Try adjusting your search.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {tutors.filter(t =>
              !query || (t.display_name || t.full_name || '').toLowerCase().includes(query.toLowerCase()) ||
              t.subjects.some(s => (s.name || '').toLowerCase().includes(query.toLowerCase()))
            ).map(t => <TutorCard key={t.id} t={t} />)}
          </div>
        )
      )}
    </div>
  );
}

function ClassCard({ g }: { g: GroupListing }) {
  const gradient = gradientFor(g.name);
  const spotsLeft = g.max_students - g.member_count;
  const isFull = spotsLeft <= 0;
  const isLow = spotsLeft > 0 && spotsLeft <= 3;
  const price = g.price_monthly ?? 0;
  const tutorName = g.tutor?.display_name || g.tutor?.full_name || 'Tutor';
  const rating = g.tutor?.rating_average ?? g.average_rating ?? null;
  const schedule = (() => {
    const entries = parseScheduleData(g.schedule_data);
    if (entries.length) return scheduleToDisplay(entries).split('\n')[0];
    return g.schedule_display?.split('\n')[0] || null;
  })();

  return (
    <Link href={`/student/explore/${g.id}`}
      className="group rounded-2xl border border-border bg-background overflow-hidden hover:border-brand-deep/40 hover:shadow-card transition flex flex-col">
      {/* Banner */}
      <div className={cn('relative h-28 flex items-end p-3', !g.cover_image && `bg-gradient-to-br ${gradient}`)}
        style={g.cover_image ? { backgroundImage: `url(${g.cover_image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        {isFull && <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-ink/80 text-white">Class full</span>}
        <div className="size-12 rounded-2xl bg-white/90 backdrop-blur grid place-items-center text-2xl shadow-md">📚</div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-ink leading-tight">{g.name}</h3>
          {rating && rating > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
              <Star className="size-3 fill-amber-500 text-amber-500"/> {rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">by {tutorName}{g.subject ? ` · ${g.subject}` : ''}{g.form_level ? ` · ${g.form_level}` : ''}</div>

        <div className="mt-2 flex flex-wrap gap-1">
          {g.feedback_mode === 'included_free' && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-brand text-white">
              <Sparkles className="size-2.5"/> Free parent feedback
            </span>
          )}
          {g.feedback_mode === 'paid_addon' && g.parent_feedback_price && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
              <Sparkles className="size-2.5"/> Feedback +{fmtTTD(g.parent_feedback_price)}/mo
            </span>
          )}
          {g.require_join_requests && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">Approval required</span>
          )}
          {isLow && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-coral-soft text-coral"><Flame className="size-2.5"/> {spotsLeft} left</span>}
        </div>

        {schedule && <div className="text-xs text-muted-foreground mt-2">{schedule}</div>}

        <div className="mt-auto pt-3 border-t border-border flex items-center justify-between">
          <div>
            {price > 0 ? (
              <><span className="font-bold text-ink">{fmtTTD(price)}</span><span className="text-[11px] text-muted-foreground">/mo</span></>
            ) : (
              <span className="font-bold text-brand-deep">Free</span>
            )}
          </div>
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
            isFull ? 'bg-muted text-muted-foreground' : g.require_join_requests ? 'bg-sky-100 text-sky-800' : 'bg-brand-soft text-brand-deep')}>
            {isFull ? 'Full' : g.require_join_requests ? 'Request' : 'Join'}
          </span>
        </div>
      </div>
    </Link>
  );
}

function TutorCard({ t }: { t: TutorListing }) {
  const name = t.display_name || t.full_name || 'Tutor';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const minPrice = t.subjects.length ? Math.min(...t.subjects.map(s => s.price_per_hour_ttd)) : null;
  const subjectList = t.subjects.slice(0, 3).map(s => s.label || s.name).filter(Boolean).join(' · ');

  return (
    <Link href={`/student/tutors/${t.id}`}
      className="group rounded-2xl bg-background border border-border p-4 hover:border-brand-deep/40 hover:shadow-card transition flex gap-3 items-start">
      <div className="size-12 rounded-xl bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-white font-bold text-sm shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-ink truncate">{name}</h3>
            <div className="text-xs text-muted-foreground truncate mt-0.5">{subjectList || 'Tutor'}</div>
          </div>
          {t.average_rating && t.average_rating > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
              <Star className="size-3 fill-amber-500 text-amber-500"/> {t.average_rating.toFixed(1)}
            </span>
          )}
        </div>
        {t.bio && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{t.bio}</p>}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <div className="text-sm">
            {minPrice != null ? (
              <><span className="font-bold text-ink">{fmtTTD(minPrice)}</span><span className="text-xs text-muted-foreground">/hr</span></>
            ) : <span className="text-muted-foreground text-xs">Contact for pricing</span>}
          </div>
          <span className="text-xs font-semibold text-brand-deep group-hover:underline">View profile →</span>
        </div>
      </div>
    </Link>
  );
}
