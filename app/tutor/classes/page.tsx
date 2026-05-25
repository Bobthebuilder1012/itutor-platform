'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Lock, Plus, Users, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type LessonKind = '1on1-oneoff' | '1on1-recurring' | 'group-oneoff' | 'group-recurring';

const LESSON_KIND_META: Record<string, { short: string; chip: string }> = {
  '1on1-oneoff':     { short: '1:1',    chip: 'bg-sky-100 text-sky-700' },
  '1on1-recurring':  { short: '1:1↻',   chip: 'bg-brand/10 text-brand-deep' },
  'group-oneoff':    { short: 'Group',  chip: 'bg-amber-100 text-amber-700' },
  'group-recurring': { short: 'Group↻', chip: 'bg-violet-100 text-violet-700' },
};

const GRADIENTS = [
  'from-orange-500 to-amber-400',
  'from-fuchsia-500 to-purple-500',
  'from-sky-500 to-cyan-400',
  'from-emerald-500 to-teal-400',
  'from-rose-500 to-pink-400',
  'from-indigo-500 to-blue-500',
];

type Lesson = {
  id: string;
  title: string;
  subject: string;
  level: string;
  kind: LessonKind;
  capacity: number;
  enrolled: number;
  pricePerSession: number | null;
  status: string;
  totalSessionsRun: number;
  earningsTtd: number;
  nextSessionDate: string | null;
  createdAt: string;
};

export default function TutorLessonsPage() {
  return (
    <TutorShell>
      <LessonsContent />
    </TutorShell>
  );
}

function LessonsContent() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const completion = useTutorCompletion(profile);
  const [search, setSearch] = useState('');
  const [lessons, setLessons] = useState<Lesson[]>([]);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchLessons(profile.id);
  }, [profile?.id]);

  async function fetchLessons(tutorId: string) {
    try {
      // Fetch groups — select * to avoid failures when optional columns don't exist
      let { data: groups, error: gErr } = await supabase
        .from('groups')
        .select('*')
        .eq('tutor_id', tutorId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (gErr) {
        console.error('[fetchLessons] groups query error:', gErr);
        // Fallback: try without archived_at filter (in case column doesn't exist yet)
        const fallback = await supabase
          .from('groups')
          .select('*')
          .eq('tutor_id', tutorId)
          .order('created_at', { ascending: false });
        if (fallback.error) {
          console.error('[fetchLessons] fallback error:', fallback.error);
          setLessons([]);
          return;
        }
        groups = fallback.data;
      }

      if (!groups || groups.length === 0) {
        setLessons([]);
        return;
      }

      // Fetch member counts separately via the API (uses service key, bypasses RLS)
      const ids = groups.map((g: any) => g.id);
      const { data: members } = await supabase
        .from('group_members')
        .select('group_id')
        .in('group_id', ids);

      const memberCountMap: Record<string, number> = {};
      for (const m of members ?? []) {
        memberCountMap[m.group_id] = (memberCountMap[m.group_id] ?? 0) + 1;
      }

      setLessons(groups.map((g: any): Lesson => ({
        id: g.id,
        title: g.name || 'Untitled class',
        subject: g.subject || '—',
        level: g.form_level || '—',
        kind: (g.max_students ?? 20) === 1 ? '1on1-recurring' : 'group-recurring',
        capacity: g.max_students ?? 0,
        enrolled: memberCountMap[g.id] ?? 0,
        pricePerSession: g.price_per_session ?? null,
        status: g.status ?? 'DRAFT',
        totalSessionsRun: 0,
        earningsTtd: 0,
        nextSessionDate: null,
        createdAt: g.created_at,
      })));
    } catch (e) {
      console.error('[fetchLessons] unexpected error:', e);
      setLessons([]);
    }
  }

  if (loading) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  const filtered = lessons.filter((l) =>
    !search || l.title.toLowerCase().includes(search.toLowerCase()) || l.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">My Classes</h1>
          <p className="text-sm text-muted-foreground mt-1">Create, manage, and grow your classes</p>
        </div>
        {completion.listed ? (
          <Link href="/tutor/classes/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand/90 shadow-sm">
            <Plus className="size-4" /> Create a Class
          </Link>
        ) : (
          <Link href="/tutor/get-listed"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-muted text-muted-foreground border border-border text-sm font-semibold hover:bg-muted/80 shadow-sm">
            <Lock className="size-4" /> Complete profile to create
          </Link>
        )}
      </header>

      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <span className="text-sm font-semibold text-ink">
          {filtered.length} active class{filtered.length === 1 ? '' : 'es'}
        </span>
        <div className="ml-auto relative w-72 max-w-full hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search classes"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((l, i) => <LessonCard key={l.id} l={l} gradient={GRADIENTS[i % GRADIENTS.length]} />)}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-20 text-sm text-muted-foreground">
            <BookOpen className="size-10 mx-auto text-muted-foreground/50" />
            <p className="mt-3">No classes yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LessonCard({ l, gradient }: { l: Lesson; gradient: string }) {
  const m = LESSON_KIND_META[l.kind] ?? LESSON_KIND_META['group-recurring'];
  const next = l.nextSessionDate ? new Date(l.nextSessionDate) : null;

  return (
    <Link href={`/tutor/classes/${l.id}`}
      className="group rounded-2xl bg-card border border-border overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <div className={cn('h-32 bg-gradient-to-br grid place-items-center relative', gradient)}>
        <BookOpen className="size-10 text-white/80" />
        <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-white/90 text-ink">
          {l.status}
        </span>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-ink truncate">{l.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{l.subject} · {l.level}</p>
          </div>
          <span className={cn('shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full', m.chip)}>
            {m.short}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-xl border border-border overflow-hidden text-center">
          <div className="py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Members</div>
            <div className="text-base font-bold text-ink tabular-nums">{l.enrolled}</div>
          </div>
          <div className="py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sessions</div>
            <div className="text-base font-bold text-ink tabular-nums">{l.totalSessionsRun}</div>
          </div>
          <div className="py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Next</div>
            <div className="text-base font-bold text-purple-600">
              {next && next > new Date() ? next.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
            </div>
          </div>
        </div>
        {l.earningsTtd > 0 && (
          <div className="mt-3 rounded-xl bg-brand/5 px-3 py-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-brand-deep font-bold">Earnings</span>
            <span className="text-sm font-bold text-brand-deep">TTD {l.earningsTtd.toLocaleString()}</span>
          </div>
        )}
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Users className="size-3" />
          {l.enrolled}/{l.capacity || '∞'} enrolled
          {l.pricePerSession ? ` · TTD ${l.pricePerSession}/session` : ''}
        </div>
      </div>
    </Link>
  );
}
