'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Globe, Lock, Plus, Users, Search,
  TrendingUp, Eye, Settings as SettingsIcon,
  MoreVertical, Calendar as CalendarIcon, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type LessonKind = '1on1-oneoff' | '1on1-recurring' | 'group-oneoff' | 'group-recurring';
type KindFilter = 'all' | 'group' | '1on1';

const LESSON_KIND_META: Record<string, { short: string; chip: string }> = {
  '1on1-oneoff':     { short: '1:1',    chip: 'bg-sky-100 text-sky-700' },
  '1on1-recurring':  { short: '1:1',    chip: 'bg-sky-100 text-sky-700' },
  'group-oneoff':    { short: 'Group',  chip: 'bg-violet-100 text-violet-700' },
  'group-recurring': { short: 'Group',  chip: 'bg-violet-100 text-violet-700' },
};

const GRADIENTS = [
  'from-brand to-emerald-400',
  'from-fuchsia-500 to-purple-500',
  'from-sky-500 to-cyan-400',
  'from-orange-500 to-amber-400',
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
  visibility: 'public' | 'private';
  thumbnailGradient: string;
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
  const [kind, setKind] = useState<KindFilter>('all');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Lesson | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchLessons(profile.id);
  }, [profile?.id]);

  async function fetchLessons(tutorId: string) {
    try {
      let { data: groups, error: gErr } = await supabase
        .from('groups')
        .select('*')
        .eq('tutor_id', tutorId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (gErr) {
        const fallback = await supabase
          .from('groups')
          .select('*')
          .eq('tutor_id', tutorId)
          .order('created_at', { ascending: false });
        if (fallback.error) { setLessons([]); return; }
        groups = fallback.data;
      }

      if (!groups || groups.length === 0) { setLessons([]); return; }

      const ids = groups.map((g: any) => g.id);

      const now = new Date();

      // Fetch member counts via API (service client bypasses RLS) + sessions in parallel
      const [memberResults, { data: sessionRows }] = await Promise.all([
        Promise.all(ids.map((id: string) =>
          fetch(`/api/groups/${id}/members`)
            .then((r) => r.ok ? r.json() : { members: [] })
            .then((j) => ({ groupId: id, members: j.members ?? [] }))
            .catch(() => ({ groupId: id, members: [] }))
        )),
        supabase.from('group_sessions').select('id, group_id').in('group_id', ids),
      ]);

      const memberCountMap: Record<string, number> = {};
      for (const { groupId: gid, members } of memberResults) {
        memberCountMap[gid] = (members as any[]).filter((m: any) =>
          ['active', 'approved'].includes(m.status)
        ).length;
      }

      // Build next upcoming occurrence per group via two separate queries to avoid RLS embedding issues
      const nextOccMap: Record<string, string> = {};
      const sessionIds = (sessionRows ?? []).map((s: any) => s.id);
      if (sessionIds.length > 0) {
        const sessionGroupMap: Record<string, string> = {};
        for (const s of sessionRows ?? []) sessionGroupMap[s.id] = s.group_id;

        const { data: occurrences } = await supabase
          .from('group_session_occurrences')
          .select('group_session_id, scheduled_start_at')
          .in('group_session_id', sessionIds)
          .eq('status', 'upcoming')
          .gte('scheduled_start_at', now.toISOString())
          .order('scheduled_start_at', { ascending: true });

        for (const o of occurrences ?? []) {
          const groupId = sessionGroupMap[o.group_session_id];
          if (groupId && !nextOccMap[groupId]) {
            nextOccMap[groupId] = o.scheduled_start_at;
          }
        }
      }

      setLessons(groups.map((g: any, i: number): Lesson => ({
        id: g.id,
        title: g.name || 'Untitled class',
        subject: g.subject || '—',
        level: g.form_level || '—',
        kind: (g.max_students ?? 20) === 1 ? '1on1-recurring' : 'group-recurring',
        capacity: g.max_students ?? 0,
        enrolled: memberCountMap[g.id] ?? 0,
        pricePerSession: g.price_per_session ?? null,
        visibility: g.visibility === 'private' ? 'private' : 'public',
        thumbnailGradient: GRADIENTS[i % GRADIENTS.length],
        totalSessionsRun: 0,
        earningsTtd: 0,
        nextSessionDate: nextOccMap[g.id] ?? null,
        createdAt: g.created_at,
      })));
    } catch (e) {
      console.error('[fetchLessons] unexpected error:', e);
      setLessons([]);
    }
  }

  const toggleVisibility = async (id: string) => {
    const lesson = lessons.find((l) => l.id === id);
    if (!lesson) return;
    const next = lesson.visibility === 'public' ? 'private' : 'public';
    setLessons((prev) => prev.map((l) => l.id === id ? { ...l, visibility: next } : l));
    const res = await fetch(`/api/classes/${id}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: next }),
    });
    if (!res.ok) {
      setLessons((prev) => prev.map((l) => l.id === id ? { ...l, visibility: lesson.visibility } : l));
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/classes/${pendingDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setLessons((prev) => prev.filter((l) => l.id !== pendingDelete.id));
        setPendingDelete(null);
        setDeleteConfirmName('');
      }
    } finally {
      setDeleting(false);
    }
  };

  const totals = useMemo(() => ({
    classes: lessons.length,
    students: lessons.reduce((s, l) => s + l.enrolled, 0),
    earnings: lessons.reduce((s, l) => s + l.earningsTtd, 0),
  }), [lessons]);

  const visibleLessons = useMemo(() => lessons.filter((l) => {
    if (kind === 'group' && l.kind.startsWith('1on1')) return false;
    if (kind === '1on1' && l.kind.startsWith('group')) return false;
    if (search) {
      const t = search.toLowerCase();
      return l.title.toLowerCase().includes(t) || l.subject.toLowerCase().includes(t);
    }
    return true;
  }), [lessons, kind, search]);

  if (loading) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  if (!completion.listed) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center">
        <div className="size-14 mx-auto rounded-full bg-muted grid place-items-center text-muted-foreground"><Lock className="size-6" /></div>
        <h1 className="mt-4 text-xl font-bold text-ink">My Classes is locked</h1>
        <p className="mt-2 text-sm text-muted-foreground">Complete your tutor profile to create and manage your classes.</p>
        <Link href="/tutor/get-listed" className="mt-5 inline-flex px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand/90">Complete profile</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Workspace</div>
          <h1 className="text-3xl lg:text-4xl font-bold text-ink mt-1 tracking-tight">My Classes</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Create, manage and grow every class you run on iTutor.</p>
        </div>
        <Link href="/tutor/classes/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ink text-white text-sm font-semibold hover:bg-ink/90 shadow-sm self-start sm:self-auto">
          <Plus className="size-4" /> Create a class
        </Link>
      </header>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatTile icon={<BookOpen className="size-4" />} label="Active classes" value={totals.classes.toString()} tint="brand" />
        <StatTile icon={<Users className="size-4" />} label="Total members" value={totals.students.toString()} tint="ink" />
        <StatTile icon={<TrendingUp className="size-4" />} label="Lifetime earnings" value={`TTD ${totals.earnings.toLocaleString()}`} tint="coral" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 pb-4 border-b border-border">
        <div className="inline-flex p-1 rounded-xl bg-muted text-xs font-semibold">
          {([
            { id: 'all', label: 'All' },
            { id: 'group', label: 'Group' },
            { id: '1on1', label: '1-on-1' },
          ] as { id: KindFilter; label: string }[]).map((f) => (
            <button key={f.id} onClick={() => setKind(f.id)}
              className={cn('px-3 py-1.5 rounded-lg transition', kind === f.id ? 'bg-background text-ink shadow-sm' : 'text-muted-foreground hover:text-ink')}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or subject"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
      </div>

      {/* Grid */}
      {visibleLessons.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-12 text-center">
          <div className="mx-auto size-12 rounded-2xl bg-brand/10 text-brand grid place-items-center mb-4">
            <BookOpen className="size-5" />
          </div>
          <h2 className="font-bold text-ink">No classes match</h2>
          <p className="text-sm text-muted-foreground mt-1">Try a different filter — or create a new class.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleLessons.map((l) => (
            <LessonCard key={l.id} l={l}
              onToggleVisibility={() => toggleVisibility(l.id)}
              onDelete={() => { setPendingDelete(l); setDeleteConfirmName(''); }}
            />
          ))}
        </div>
      )}

      {/* Delete confirm dialog */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-ink">Delete this class?</h2>
            <p className="text-sm text-muted-foreground">
              This will permanently archive <strong>"{pendingDelete.title}"</strong> including all sessions, stream posts and roster history. Type the class name to confirm.
            </p>
            <input
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={pendingDelete.title}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setPendingDelete(null); setDeleteConfirmName(''); }}
                className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmName !== pendingDelete.title || deleting}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
                {deleting ? 'Deleting…' : 'Delete class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: string; tint: 'brand' | 'ink' | 'coral' }) {
  const tints = {
    brand: 'bg-brand/10 text-brand',
    ink: 'bg-ink/5 text-ink',
    coral: 'bg-rose-50 text-rose-600',
  } as const;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
      <div className={cn('size-9 rounded-xl grid place-items-center shrink-0', tints[tint])}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground truncate">{label}</div>
        <div className="text-base sm:text-lg font-bold text-ink truncate tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function LessonCard({
  l, onToggleVisibility, onDelete,
}: {
  l: Lesson;
  onToggleVisibility: () => void;
  onDelete: () => void;
}) {
  const m = LESSON_KIND_META[l.kind] ?? LESSON_KIND_META['group-recurring'];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isPublic = l.visibility === 'public';

  const next = l.nextSessionDate ? new Date(l.nextSessionDate) : null;
  const upcoming = next && next > new Date();

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div className="group relative rounded-2xl bg-card border border-border overflow-hidden hover:shadow-lg hover:-translate-y-0.5 hover:border-brand/30 transition-all flex flex-col">
      {/* Banner */}
      <Link href={`/tutor/classes/${l.id}`} className="block">
        <div className={cn('relative h-28 bg-gradient-to-br', l.thumbnailGradient)}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
          <BookOpen className="absolute bottom-3 left-4 size-7 text-white/85" />
          <span className={cn(
            'absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full backdrop-blur-sm',
            isPublic ? 'bg-white/90 text-ink' : 'bg-ink/80 text-white',
          )}>
            {isPublic ? <Globe className="size-3" /> : <Lock className="size-3" />}
            {isPublic ? 'Public' : 'Private'}
          </span>
        </div>
      </Link>

      {/* Body */}
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start gap-2 mb-1 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded">{l.subject}</span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{l.level}</span>
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', m.chip)}>{m.short}</span>
        </div>
        <h3 className="font-bold text-ink leading-tight truncate">{l.title}</h3>

        {/* Stat strip */}
        <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-xl border border-border overflow-hidden text-center bg-background">
          <Stat label="Members" value={`${l.enrolled}/${l.capacity || '∞'}`} />
          <Stat label="Sessions" value={(l.totalSessionsRun ?? 0).toString()} />
          <Stat label="Next" value={upcoming ? next!.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'} tint={upcoming ? 'brand' : undefined} />
        </div>

        {/* Earnings */}
        <div className="mt-3 rounded-xl bg-brand/5 px-3 py-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-brand font-bold inline-flex items-center gap-1.5">
            <TrendingUp className="size-3" /> Earnings
          </span>
          <span className="text-sm font-bold text-brand tabular-nums">TTD {(l.earningsTtd ?? 0).toLocaleString()}</span>
        </div>

        {/* Footer actions */}
        <div className="mt-4 pt-3 border-t border-border flex items-center gap-2">
          <Link href={`/tutor/classes/${l.id}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-ink text-white text-xs font-semibold hover:bg-ink/90 transition">
            <Eye className="size-3.5" /> Open class
          </Link>
          <Link href={`/tutor/classes/${l.id}?tab=settings`} aria-label="Class settings"
            className="inline-flex items-center justify-center size-9 rounded-lg border border-border bg-background text-muted-foreground hover:text-ink hover:border-ink transition">
            <SettingsIcon className="size-4" />
          </Link>
          <div ref={menuRef} className="relative">
            <button
              aria-label="More options"
              onClick={() => setMenuOpen((o) => !o)}
              className="inline-flex items-center justify-center size-9 rounded-lg border border-border bg-background text-muted-foreground hover:text-ink hover:border-ink transition">
              <MoreVertical className="size-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 bottom-full mb-1 w-52 bg-card border border-border rounded-xl shadow-lg z-20 py-1 text-sm">
                <Link href={`/tutor/classes/${l.id}`}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-muted text-ink transition">
                  <SettingsIcon className="size-4 text-muted-foreground" /> Open settings
                </Link>
                <Link href={`/tutor/classes/${l.id}?tab=sessions`}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-muted text-ink transition">
                  <CalendarIcon className="size-4 text-muted-foreground" /> View sessions
                </Link>
                <div className="my-1 border-t border-border" />
                <button onClick={() => { setMenuOpen(false); onToggleVisibility(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-ink transition">
                  {isPublic ? <Lock className="size-4 text-muted-foreground" /> : <Globe className="size-4 text-muted-foreground" />}
                  Switch to {isPublic ? 'private' : 'public'}
                </button>
                <div className="my-1 border-t border-border" />
                <button onClick={() => { setMenuOpen(false); onDelete(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-rose-50 text-rose-600 transition">
                  <Trash2 className="size-4" /> Delete class
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: 'brand' }) {
  return (
    <div className="py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={cn('text-sm font-bold tabular-nums', tint === 'brand' ? 'text-brand' : 'text-ink')}>{value}</div>
    </div>
  );
}
