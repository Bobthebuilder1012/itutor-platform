'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Lock, Plus, Users, Clock, ArrowRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import TutorShell from '@/components/tutor/TutorShell';
import CreateGroupModal from '@/components/groups/tutor/CreateGroupModal';

type Lesson = {
  id: string;
  title: string;
  subject: string;
  level: string;
  capacity: number;
  enrolled: number;
  pricePerSession: number | null;
  status: string;
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
  const [tab, setTab] = useState<'mine' | 'archived'>('mine');
  const [search, setSearch] = useState('');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchLessons(profile.id);
  }, [profile?.id]);

  async function fetchLessons(tutorId: string) {
    setDataLoading(true);
    try {
      const [activeRes, archivedRes] = await Promise.all([
        fetch('/api/groups?limit=50'),
        fetch('/api/groups?archived=true&limit=50'),
      ]);
      const [activeJson, archivedJson] = await Promise.all([
        activeRes.json(),
        archivedRes.json(),
      ]);

      const activeGroups: any[] = (activeJson.groups ?? []).filter((g: any) => g.tutor_id === tutorId);
      const archivedGroups: any[] = (archivedJson.groups ?? []).filter((g: any) => g.tutor_id === tutorId);

      const mapGroup = (g: any, archived: boolean): Lesson => ({
        id: g.id,
        title: g.name || g.title || 'Untitled lesson',
        subject: g.subject || '—',
        level: g.formLevel || g.form_level || '—',
        capacity: g.maxStudents ?? g.max_students ?? 0,
        enrolled: g.enrollmentCount ?? g.member_count ?? 0,
        pricePerSession: g.pricePerSession ?? g.price_per_session ?? null,
        status: archived ? 'archived' : 'published',
        createdAt: g.created_at,
      });

      setLessons([
        ...activeGroups.map((g) => mapGroup(g, false)),
        ...archivedGroups.map((g) => mapGroup(g, true)),
      ]);
    } catch (err) {
      console.error('[fetchLessons] error:', err);
      setLessons([]);
    } finally {
      setDataLoading(false);
    }
  }

  if (completion.loading) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  if (!completion.listed) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Lock className="size-10 mx-auto text-muted-foreground/40" />
          <h2 className="mt-3 text-xl font-bold text-ink">Lessons are locked</h2>
          <p className="mt-2 text-sm text-muted-foreground">Complete your profile to start creating 1:1 and group lessons.</p>
          <Link href="/tutor/get-listed" className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-deep">
            Complete profile
          </Link>
        </div>
      </div>
    );
  }

  const filtered = lessons.filter((l) => {
    const matchTab = tab === 'archived' ? l.status === 'archived' : l.status !== 'archived';
    const matchSearch = !search || l.title.toLowerCase().includes(search.toLowerCase()) || l.subject.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  return (
    <div className="max-w-7xl space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">Lesson Marketplace</h1>
          <p className="text-sm text-muted-foreground mt-1">Create 1:1 or group classes that students can discover and book.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
          <Plus className="size-4" /> Create a Class
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="border-b border-border flex items-center gap-6 text-sm flex-1">
          {(['mine', 'archived'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('relative pb-3 font-semibold capitalize transition', tab === t ? 'text-ink' : 'text-muted-foreground hover:text-ink')}>
              {t === 'mine' ? 'My Lessons' : 'Archived'}
              <span className="ml-1.5 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {lessons.filter((l) => t === 'archived' ? l.status === 'archived' : l.status !== 'archived').length}
              </span>
              {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
            </button>
          ))}
        </div>
        <div className="hidden md:block relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lessons…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
      </div>

      {dataLoading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading lessons…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <BookOpen className="size-10 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-ink">{tab === 'mine' ? 'No lessons yet' : 'No archived lessons'}</p>
          {tab === 'mine' && (
            <>
              <p className="mt-1 text-xs text-muted-foreground">Create your first 1:1 or group class to start receiving bookings.</p>
              <button onClick={() => setCreateOpen(true)} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
                <Plus className="size-4" /> Create a class
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((l) => <LessonCard key={l.id} l={l} />)}
        </div>
      )}

      {createOpen && profile && (
        <CreateGroupModal
          onClose={() => setCreateOpen(false)}
          onCreated={(groupId) => {
            setCreateOpen(false);
            fetchLessons(profile.id);
          }}
        />
      )}
    </div>
  );
}

function LessonCard({ l }: { l: Lesson }) {
  return (
    <Link href={`/tutor/lessons/${l.id}`} className="rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition">
      <div className="h-24 bg-gradient-to-br from-brand to-brand-deep" />
      <div className="p-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-brand-deep">{l.level}</div>
        <div className="font-semibold text-ink line-clamp-2 mt-1">{l.title}</div>
        <div className="text-xs text-muted-foreground mt-1">{l.subject}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs pt-3 border-t border-border">
          <div>
            <div className="text-muted-foreground">Members</div>
            <div className="font-bold tabular-nums text-ink">{l.enrolled}/{l.capacity || '∞'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Status</div>
            <div className="font-bold capitalize text-ink">{l.status}</div>
          </div>
          <div className="text-right">
            <div className="text-muted-foreground">Price</div>
            <div className="font-bold tabular-nums text-ink">{l.pricePerSession ? `TT$${l.pricePerSession}` : '—'}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}
