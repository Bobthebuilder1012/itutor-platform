'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Users, BookOpen, Search } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Lesson = {
  key: string;
  type: 'group' | 'one-on-one';
  href: string;
  title: string;
  tutorName: string;
  subject: string;
  gradient: string;
};

const GRADIENTS = [
  'from-brand to-emerald-400',
  'from-fuchsia-500 to-purple-500',
  'from-sky-500 to-cyan-400',
  'from-orange-500 to-amber-400',
  'from-rose-500 to-pink-400',
  'from-indigo-500 to-blue-500',
];

function gradientForSubject(subject: string, index: number): string {
  const s = (subject || '').toLowerCase();
  if (s.includes('math')) return 'from-orange-500 to-amber-400';
  if (s.includes('physics')) return 'from-sky-500 to-cyan-400';
  if (s.includes('chem')) return 'from-emerald-500 to-teal-400';
  if (s.includes('bio')) return 'from-brand to-emerald-400';
  if (s.includes('english')) return 'from-indigo-500 to-blue-500';
  if (s.includes('history')) return 'from-rose-500 to-pink-400';
  if (s.includes('econ') || s.includes('account')) return 'from-amber-500 to-yellow-400';
  if (s.includes('sea')) return 'from-violet-500 to-purple-400';
  if (s.includes('info') || s.includes('it')) return 'from-fuchsia-500 to-purple-500';
  return GRADIENTS[index % GRADIENTS.length];
}

export default function MyLessonsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'student') { router.push('/login'); return; }
    fetchLessons();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, profileLoading]);

  async function fetchLessons() {
    try {
      const [bookingsRes, groupsPayload] = await Promise.all([
        supabase
          .from('bookings')
          .select(`
            tutor_id, subject_id,
            tutor:profiles!bookings_tutor_id_fkey(full_name, display_name),
            subject:subjects!bookings_subject_id_fkey(name, label)
          `)
          .eq('student_id', profile!.id)
          .not('status', 'in', '("CANCELLED_BY_STUDENT","CANCELLED_BY_TUTOR","REJECTED")')
          .order('created_at', { ascending: false }),
        fetch('/api/student/my-groups', { cache: 'no-store' }).then(r => r.ok ? r.json() : { groups: [] }),
      ]);

      const result: Lesson[] = [];
      let idx = 0;

      for (const grp of groupsPayload?.groups ?? []) {
        const tutor = Array.isArray(grp.tutor) ? grp.tutor[0] : grp.tutor;
        result.push({
          key: `group-${grp.id}`,
          type: 'group',
          href: `/student/my-lessons/${grp.id}`,
          title: grp.name,
          subject: grp.subject || '',
          tutorName: tutor?.display_name || tutor?.full_name || 'Unknown Tutor',
          gradient: gradientForSubject(grp.subject || grp.name || '', idx++),
        });
      }

      const seen = new Set<string>();
      for (const b of bookingsRes.data ?? []) {
        const tutorObj = Array.isArray(b.tutor) ? b.tutor[0] : b.tutor;
        const subjectObj = Array.isArray(b.subject) ? b.subject[0] : b.subject;
        const subjectName = subjectObj?.label || subjectObj?.name || 'Tutoring';
        const dedupeKey = `${b.tutor_id}-${b.subject_id}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        result.push({
          key: `booking-${b.tutor_id}-${b.subject_id}`,
          type: 'one-on-one',
          href: `/student/tutors/${b.tutor_id}`,
          title: subjectName,
          subject: subjectName,
          tutorName: tutorObj?.display_name || tutorObj?.full_name || 'Your Tutor',
          gradient: gradientForSubject(subjectName, idx++),
        });
      }

      setLessons(result);
    } catch {
      setLessons([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = lessons.filter((l) =>
    !search ||
    l.title.toLowerCase().includes(search.toLowerCase()) ||
    l.subject.toLowerCase().includes(search.toLowerCase()) ||
    l.tutorName.toLowerCase().includes(search.toLowerCase())
  );

  return (
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Student</div>
            <h1 className="text-3xl font-bold text-ink mt-1 tracking-tight">My Classes</h1>
            <p className="text-sm text-muted-foreground mt-1">All your enrolled lessons in one place</p>
          </div>
          {lessons.length > 0 && (
            <Link href="/student/find-tutors"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition self-start sm:self-auto">
              + Find more classes
            </Link>
          )}
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
          </div>
        ) : lessons.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border p-16 text-center">
            <div className="mx-auto size-12 rounded-2xl bg-brand/10 text-brand grid place-items-center mb-4">
              <BookOpen className="size-5" />
            </div>
            <p className="font-bold text-ink text-lg">No classes yet</p>
            <p className="text-sm text-muted-foreground mt-1">Find a tutor or join a group class to get started.</p>
            <Link href="/student/find-tutors"
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand/90">
              Browse classes
            </Link>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your classes…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((l) => (
                <Link key={l.key} href={l.href}
                  className="group rounded-2xl bg-card border border-border overflow-hidden hover:shadow-lg hover:-translate-y-0.5 hover:border-brand/30 transition-all flex flex-col">
                  <div className={cn('h-24 bg-gradient-to-br relative', l.gradient)}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_60%)]" />
                    <BookOpen className="absolute bottom-3 left-4 size-6 text-white/80" />
                    <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-white/90 text-ink">
                      {l.type === 'group' ? 'Group' : '1-on-1'}
                    </span>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="font-bold text-ink leading-tight line-clamp-1">{l.title}</div>
                    {l.subject && l.subject !== l.title && (
                      <div className="text-xs text-muted-foreground mt-0.5">{l.subject}</div>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-border mt-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="size-3.5" />
                        <span className="truncate max-w-[130px]">{l.tutorName}</span>
                      </div>
                      <ArrowRight className="size-4 text-brand group-hover:translate-x-0.5 transition" />
                    </div>
                  </div>
                </Link>
              ))}

              {filtered.length === 0 && (
                <div className="col-span-full text-center py-10 text-sm text-muted-foreground">
                  No classes match your search.
                </div>
              )}
            </div>
          </>
        )}
      </div>
  );
}
