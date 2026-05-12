'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Search, LayoutGrid, List as ListIcon, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type StudentRow = {
  id: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  level: string;
  primarySubjects: string[];
  totalSessions: number;
  lastSessionAt: string | null;
  active: boolean;
};

export default function TutorStudentsPage() {
  return (
    <TutorShell>
      <StudentsContent />
    </TutorShell>
  );
}

function StudentsContent() {
  const { profile } = useProfile();
  const searchParams = useSearchParams();
  const initialSearch = searchParams?.get('q') ?? '';
  const [view, setView] = useState<'row' | 'card'>('row');
  const [search, setSearch] = useState(initialSearch);
  const [active, setActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [sort, setSort] = useState<'recent' | 'alpha' | 'sessions'>('recent');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    fetchStudents(profile.id);
  }, [profile?.id]);

  async function fetchStudents(tutorId: string) {
    setLoading(true);
    try {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, student_id, subject:subjects(label, name), profiles:profiles!bookings_student_id_fkey(id, full_name, display_name, avatar_url, form_level)')
        .eq('tutor_id', tutorId);

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, scheduled_start, status, booking:bookings(student_id)')
        .eq('tutor_id', tutorId)
        .in('status', ['completed', 'scheduled', 'in_progress']);

      const map = new Map<string, StudentRow>();
      const subjectsByStudent = new Map<string, Set<string>>();
      const lastByStudent = new Map<string, string>();
      const countByStudent = new Map<string, number>();

      (sessions ?? []).forEach((s: any) => {
        const booking = Array.isArray(s.booking) ? s.booking[0] : s.booking;
        const sid = booking?.student_id;
        if (!sid) return;
        countByStudent.set(sid, (countByStudent.get(sid) ?? 0) + (s.status === 'completed' ? 1 : 0));
        if (s.status === 'completed') {
          const cur = lastByStudent.get(sid);
          if (!cur || new Date(s.scheduled_start).getTime() > new Date(cur).getTime()) {
            lastByStudent.set(sid, s.scheduled_start);
          }
        }
      });

      (bookings ?? []).forEach((b: any) => {
        const studentProfile = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles;
        if (!studentProfile?.id) return;
        const subject = Array.isArray(b.subject) ? b.subject[0] : b.subject;
        const subjLabel = subject?.label || subject?.name;
        if (subjLabel) {
          if (!subjectsByStudent.has(studentProfile.id)) subjectsByStudent.set(studentProfile.id, new Set());
          subjectsByStudent.get(studentProfile.id)!.add(subjLabel);
        }
        if (!map.has(studentProfile.id)) {
          const name = studentProfile.display_name || studentProfile.full_name || 'Student';
          map.set(studentProfile.id, {
            id: studentProfile.id,
            name,
            initials: name.split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase(),
            avatarUrl: studentProfile.avatar_url ?? null,
            level: studentProfile.form_level || '—',
            primarySubjects: [],
            totalSessions: 0,
            lastSessionAt: null,
            active: true,
          });
        }
      });

      const list: StudentRow[] = [];
      map.forEach((row, id) => {
        row.primarySubjects = Array.from(subjectsByStudent.get(id) ?? []);
        row.totalSessions = countByStudent.get(id) ?? 0;
        row.lastSessionAt = lastByStudent.get(id) ?? null;
        const last = row.lastSessionAt ? new Date(row.lastSessionAt).getTime() : 0;
        const sixtyDaysAgo = Date.now() - 60 * 24 * 3600 * 1000;
        row.active = last >= sixtyDaysAgo;
        list.push(row);
      });
      setStudents(list);
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const list = students.filter((s) =>
      (search === '' || s.name.toLowerCase().includes(search.toLowerCase())) &&
      (active === 'all' || (active === 'active' ? s.active : !s.active))
    );
    return list.sort((a, b) => {
      if (sort === 'alpha') return a.name.localeCompare(b.name);
      if (sort === 'sessions') return b.totalSessions - a.totalSessions;
      return new Date(b.lastSessionAt ?? 0).getTime() - new Date(a.lastSessionAt ?? 0).getTime();
    });
  }, [students, search, active, sort]);

  return (
    <div className="max-w-7xl space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">My Students</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} of {students.length} students</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            <button onClick={() => setView('row')} className={cn('size-8 grid place-items-center rounded-md', view === 'row' ? 'bg-ink text-white' : 'text-muted-foreground hover:text-ink')}>
              <ListIcon className="size-4" />
            </button>
            <button onClick={() => setView('card')} className={cn('size-8 grid place-items-center rounded-md', view === 'card' ? 'bg-ink text-white' : 'text-muted-foreground hover:text-ink')}>
              <LayoutGrid className="size-4" />
            </button>
          </div>
          <Link href="/tutor/find-students" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90">
            Find new students
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <select value={active} onChange={(e) => setActive(e.target.value as 'all' | 'active' | 'inactive')} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="all">All students</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'alpha' | 'sessions')} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="recent">Sort: Most recent session</option>
          <option value="alpha">Sort: Alphabetical</option>
          <option value="sessions">Sort: Most sessions</option>
        </select>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading students…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">No students match your filters yet. Once a student books a session with you, they'll appear here.</p>
        </div>
      ) : view === 'row' ? (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {filtered.map((s) => <StudentRowCard key={s.id} s={s} />)}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => <StudentCard key={s.id} s={s} />)}
        </div>
      )}
    </div>
  );
}

function StudentRowCard({ s }: { s: StudentRow }) {
  return (
    <Link href={`/tutor/students/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition">
      <div className="size-10 rounded-full bg-coral/20 text-coral grid place-items-center text-sm font-semibold overflow-hidden shrink-0">
        {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="size-10 rounded-full object-cover" /> : s.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink truncate">{s.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {s.level} · {s.primarySubjects.slice(0, 3).join(', ') || 'No subjects yet'}
        </div>
      </div>
      <div className="hidden md:block text-right shrink-0">
        <div className="text-xs text-muted-foreground">Last session</div>
        <div className="text-sm font-semibold text-ink">{s.lastSessionAt ? relTime(s.lastSessionAt) : '—'}</div>
      </div>
      <div className="hidden md:block text-right shrink-0">
        <div className="text-xs text-muted-foreground">Sessions</div>
        <div className="text-sm font-semibold text-ink tabular-nums">{s.totalSessions}</div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function StudentCard({ s }: { s: StudentRow }) {
  return (
    <Link href={`/tutor/students/${s.id}`} className="rounded-2xl border border-border bg-card p-4 hover:shadow-card transition">
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-full bg-coral/20 text-coral grid place-items-center text-sm font-semibold overflow-hidden shrink-0">
          {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="size-12 rounded-full object-cover" /> : s.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate">{s.name}</div>
          <div className="text-xs text-muted-foreground truncate">{s.level}</div>
        </div>
        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', s.active ? 'bg-brand-soft text-brand-deep' : 'bg-muted text-muted-foreground')}>
          {s.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {s.primarySubjects.slice(0, 3).map((sub) => (
          <span key={sub} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-ink">{sub}</span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Last session</div>
          <div className="font-semibold text-ink">{s.lastSessionAt ? relTime(s.lastSessionAt) : '—'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Sessions</div>
          <div className="font-semibold text-ink tabular-nums">{s.totalSessions}</div>
        </div>
      </div>
    </Link>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / (24 * 3600 * 1000));
  if (d < 1) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}
