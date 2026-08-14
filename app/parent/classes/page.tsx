'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Star, Users, GraduationCap, Sparkles, Flame, UserCheck, Loader2, X, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { supabase } from '@/lib/supabase/client';
import { parseScheduleData, scheduleToDisplay } from '@/lib/utils/scheduleFormat';
import { classCapacityDisplay } from '@/lib/utils/classCapacity';
import ParentShell from '@/components/parent/ParentShell';
import ChildPickerCheck from '@/components/parent/ChildPickerCheck';

type TabType = 'classes' | 'tutors';

type TutorListing = {
  id: string; full_name: string | null; display_name: string | null; username: string | null;
  avatar_url: string | null; bio: string | null; rating_average: number | null; total_reviews: number;
  subjects: { name: string; label: string; price_per_hour_ttd: number }[];
};

type GroupListing = {
  id: string; name: string; subject: string | null; form_level: string | null;
  cover_image: string | null; price_monthly: number | null; max_students: number;
  require_join_requests: boolean; feedback_mode: string | null; parent_feedback_price: number | null;
  schedule_display: string | null; schedule_data: string | null;
  session_schedule: string | null;
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
  const [children, setChildren] = useState<{ id: string; name: string }[]>([]);
  const [selectorGroup, setSelectorGroup] = useState<GroupListing | null>(null);
  // Set by ChildPickerCheck only once BOTH §5 checks pass for the chosen child:
  // no schedule clash, and any level mismatch acknowledged. Null means the Join
  // button stays disabled.
  const [readyChildId, setReadyChildId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      // schedule_display and schedule_data exist on production but NOT on
      // staging, and PostgREST rejects the whole select for one unknown
      // column — so the entire class marketplace came back empty on staging
      // and read as "No classes match". They are only a fallback for the
      // schedule line (the real source is /api/groups/schedules below), so
      // the query drops them rather than failing.
      const GROUP_COLUMNS = `
          id, name, subject, form_level, cover_image, price_monthly, max_students,
          require_join_requests, feedback_mode, parent_feedback_price, status,
          tutor:profiles!groups_tutor_id_fkey(full_name, display_name, rating_average)
      `;
      const fetchGroups = (extra: string) =>
        supabase
          .from('groups')
          .select(`${GROUP_COLUMNS}${extra}`)
          .or('status.eq.PUBLISHED,status.is.null')
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(60);

      let { data, error: groupsErr } = await fetchGroups(', schedule_display, schedule_data');
      if (groupsErr) {
        ({ data, error: groupsErr } = await fetchGroups(''));
      }
      if (groupsErr) console.error('[parent/classes] group fetch failed:', groupsErr.message);

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

      // Recurring schedules come from the server: group_sessions is unreadable
      // from the browser (its RLS policy recurses through group_members), so
      // cards fell back to no schedule at all even for classes that meet weekly.
      let scheduleMap: Record<string, { display: string | null }> = {};
      if (ids.length) {
        try {
          const res = await fetch(`/api/groups/schedules?ids=${ids.join(',')}`);
          const json = await res.json().catch(() => ({}));
          scheduleMap = json?.schedules ?? {};
        } catch { /* non-critical */ }
      }

      setGroups((data ?? []).map((g: any) => ({
        ...g,
        tutor: Array.isArray(g.tutor) ? g.tutor[0] : g.tutor,
        member_count: countMap[g.id] ?? 0,
        session_schedule: scheduleMap[g.id]?.display ?? null,
      })));

      // Fetch 1:1 tutors — the SAME "listed" set students see (complete profile
      // + priced subject + availability + video provider), not a VERIFIED-only
      // flag, so parents aren't shown a thinner list than students.
      const listedRes = await fetch('/api/tutors/listed-ids', { cache: 'no-store' });
      const listedJson = listedRes.ok ? await listedRes.json() : { ids: [] };
      const listedSet = new Set<string>(listedJson.ids ?? []);

      // The column is rating_average. Asking for "average_rating" — which
      // exists on NEITHER database — made PostgREST reject the whole select,
      // so tutorProfiles came back null and the 1:1 tab has been empty on
      // every environment since this page shipped.
      const { data: tutorProfiles, error: tutorErr } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, username, avatar_url, bio, rating_average')
        .eq('role', 'tutor')
        .or('pause_1on1.is.null,pause_1on1.eq.false')
        .limit(200);

      if (tutorErr) console.error('[parent/classes] tutor fetch failed:', tutorErr.message);

      const listedTutors = (tutorProfiles ?? []).filter((t: any) => listedSet.has(t.id));

      // Order by the marketplace ranking view (pinned first, then score) — matches students.
      try {
        const rankIds = listedTutors.map((t: any) => t.id);
        if (rankIds.length) {
          const { data: ranks } = await supabase
            .from('tutor_marketplace_rankings')
            .select('tutor_id, pin_rank, ranking_score')
            .in('tutor_id', rankIds);
          const rankMap = new Map((ranks ?? []).map((r: any) => [r.tutor_id, { pin: r.pin_rank ?? null, score: Number(r.ranking_score ?? 0) }]));
          listedTutors.sort((a: any, b: any) => {
            const ra = rankMap.get(a.id) ?? { pin: null, score: 0 };
            const rb = rankMap.get(b.id) ?? { pin: null, score: 0 };
            if (ra.pin != null || rb.pin != null) {
              if (ra.pin == null) return 1;
              if (rb.pin == null) return -1;
              if (ra.pin !== rb.pin) return ra.pin - rb.pin;
            }
            return rb.score - ra.score;
          });
        }
      } catch { /* keep listed order if the ranking view isn't present */ }

      const tutorIds = listedTutors.map((t: any) => t.id);
      const { data: subjects } = tutorIds.length
        ? await supabase
            .from('tutor_subjects')
            .select('tutor_id, subject:subjects(name, label), price_per_hour_ttd')
            .in('tutor_id', tutorIds)
        : { data: [] as any[] };

      const subjectsByTutor = new Map<string, any[]>();
      (subjects ?? []).forEach((s: any) => {
        const sub = Array.isArray(s.subject) ? s.subject[0] : s.subject;
        const arr = subjectsByTutor.get(s.tutor_id) ?? [];
        arr.push({ name: sub?.name, label: sub?.label || sub?.name, price_per_hour_ttd: s.price_per_hour_ttd });
        subjectsByTutor.set(s.tutor_id, arr);
      });

      setTutors(listedTutors.map((t: any) => ({
        ...t,
        total_reviews: 0,
        subjects: subjectsByTutor.get(t.id) ?? [],
      })));

      // Linked children — for joining a class on their behalf.
      try {
        const cr = await fetch('/api/parent/children/summary', { cache: 'no-store' });
        if (cr.ok) { const cj = await cr.json(); setChildren((cj.children ?? []).map((c: any) => ({ id: c.id, name: c.name }))); }
      } catch { /* ignore */ }

      setLoading(false);
    })();
  }, []);

  async function doEnroll(childId: string, g: GroupListing) {
    setJoining(true);
    setToast(null);
    try {
      const res = await fetch('/api/parent/enroll-child', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ childId, groupId: g.id }),
      });
      const data = await res.json();
      const childName = children.find((c) => c.id === childId)?.name ?? 'your child';
      if (!res.ok) { setToast({ kind: 'err', text: data.error || 'Could not join this class.' }); return; }
      setToast({ kind: 'ok', text: g.require_join_requests ? `Request sent for ${childName} to join ${g.name}.` : `${childName} joined ${g.name}.` });
    } catch {
      setToast({ kind: 'err', text: 'Could not join this class.' });
    } finally {
      setJoining(false);
      setSelectorGroup(null);
    }
  }

  function startJoin(g: GroupListing) {
    if (children.length === 0) { setToast({ kind: 'err', text: 'Link a child first (Your children) before joining a class.' }); return; }
    // Opens for ONE child as well as several. §5 skips the picker for a single
    // child, not the checks — enrolling straight from the card was skipping the
    // schedule conflict and level confirmation entirely for one-child parents,
    // which is the majority case. ChildPickerCheck hides its own picker when
    // there is only one child and still runs both checks.
    setReadyChildId(null);
    setSelectorGroup(g);
  }

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
            {filtered.map(g => <ClassCard key={g.id} g={g} onJoin={() => startJoin(g)} joining={joining} />)}
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

      {/* §5 booking flow: the child is chosen here, inside the flow, and only
          then do the schedule-conflict and level checks resolve. Browsing stays
          neutral — there is no child in the header and no "shopping as" mode. */}
      {selectorGroup && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onClick={() => setSelectorGroup(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="my-auto w-full max-w-md rounded-2xl bg-background border border-border shadow-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold text-ink">Join {selectorGroup.name}</div>
              <button onClick={() => setSelectorGroup(null)} className="size-8 shrink-0 rounded-full hover:bg-muted grid place-items-center"><X className="size-4" /></button>
            </div>

            <ChildPickerCheck groupId={selectorGroup.id} onReady={setReadyChildId} />

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {/* Disabled until the checks pass. A clash blocks; a level mismatch
                  only needs the confirmation ticked — that asymmetry is §5's. */}
              <button
                onClick={() => readyChildId && doEnroll(readyChildId, selectorGroup)}
                disabled={!readyChildId || joining}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {joining ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                {selectorGroup.require_join_requests ? 'Send join request' : 'Join this class'}
              </button>
              <button
                onClick={() => setSelectorGroup(null)}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md px-4">
          <div className={cn('rounded-xl px-4 py-3 text-sm shadow-lg flex items-start gap-2', toast.kind === 'ok' ? 'bg-brand text-white' : 'bg-rose-600 text-white')}>
            <span className="flex-1">{toast.text}</span>
            <button onClick={() => setToast(null)} className="opacity-80 hover:opacity-100"><X className="size-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClassCard({ g, onJoin, joining }: { g: GroupListing; onJoin: () => void; joining: boolean }) {
  const gradient = gradientFor(g.name);
  const spotsLeft = g.max_students - g.member_count;
  const isFull = spotsLeft <= 0;
  const isLow = spotsLeft > 0 && spotsLeft <= 3;
  // Parents see the same scarcity rule as students. This card never showed a
  // raw roster count, so it only needed the threshold widened from 3 to 9.
  const capacity = classCapacityDisplay(g.member_count, g.max_students);
  const price = g.price_monthly ?? 0;
  const tutorName = g.tutor?.display_name || g.tutor?.full_name || 'Tutor';
  const rating = g.tutor?.rating_average ?? g.average_rating ?? null;
  const schedule = (() => {
    const entries = parseScheduleData(g.schedule_data);
    if (entries.length) return scheduleToDisplay(entries).split('\n')[0];
    return g.session_schedule?.split('\n')[0] || g.schedule_display?.split('\n')[0] || null;
  })();

  return (
    <div className="rounded-2xl border border-border bg-background overflow-hidden hover:shadow-card transition flex flex-col">
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
          {/* Parent feedback hidden — coming soon */}
          {g.require_join_requests && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">Approval required</span>
          )}
          {capacity.kind === 'spots_left' && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-coral-soft text-coral"><Flame className="size-2.5"/> {capacity.label}</span>}
        </div>

        {schedule && <div className="text-xs text-muted-foreground mt-2">{schedule}</div>}

        <div className="mt-auto pt-3 border-t border-border flex items-center justify-between gap-2">
          <div>
            {price > 0 ? (
              <><span className="font-bold text-ink">{fmtTTD(price)}</span><span className="text-[11px] text-muted-foreground">/mo</span></>
            ) : (
              <span className="font-bold text-brand-deep">Free</span>
            )}
          </div>
          <button
            onClick={onJoin}
            disabled={isFull || joining}
            className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition disabled:opacity-50',
              isFull ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-brand text-white hover:bg-brand-deep')}>
            <UserPlus className="size-3.5" />
            {isFull ? 'Full' : g.require_join_requests ? 'Request for child' : 'Join for child'}
          </button>
        </div>
      </div>
    </div>
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
          {t.rating_average && t.rating_average > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
              <Star className="size-3 fill-amber-500 text-amber-500"/> {t.rating_average.toFixed(1)}
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
