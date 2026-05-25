'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Users, BookOpen } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { StudentShell } from '@/components/student/StudentShell';

type Lesson = {
  key: string;
  type: 'group' | 'one-on-one';
  href: string;
  title: string;
  tutorName: string;
  color: string;
  emoji: string;
};

const SUBJECT_META: Record<string, { color: string; emoji: string }> = {
  math:    { color: 'coral',    emoji: '📐' },
  physics: { color: 'sky',     emoji: '⚛️' },
  chem:    { color: 'peach',   emoji: '🧪' },
  bio:     { color: 'brand',   emoji: '🧬' },
  english: { color: 'lavender',emoji: '📚' },
  history: { color: 'coral',   emoji: '📜' },
  geo:     { color: 'brand',   emoji: '🌍' },
  econ:    { color: 'peach',   emoji: '📊' },
  inform:  { color: 'sky',     emoji: '💻' },
  account: { color: 'peach',   emoji: '📒' },
  sea:     { color: 'brand',   emoji: '✏️' },
};

function getMeta(name: string) {
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(SUBJECT_META)) {
    if (lower.includes(key)) return val;
  }
  return { color: 'brand', emoji: '📖' };
}

export default function MyLessonsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

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
        fetch('/api/student/my-groups', { cache: 'no-store' }).then(r => r.json()),
      ]);

      const result: Lesson[] = [];

      for (const grp of groupsPayload?.groups ?? []) {
        const tutor = Array.isArray(grp.tutor) ? grp.tutor[0] : grp.tutor;
        const { color, emoji } = getMeta(grp.subject || grp.name || '');
        result.push({
          key: `group-${grp.id}`,
          type: 'group',
          href: `/student/groups/${grp.id}`,
          title: grp.name,
          tutorName: tutor?.display_name || tutor?.full_name || 'Unknown Tutor',
          color,
          emoji,
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
        const { color, emoji } = getMeta(subjectName);
        result.push({
          key: `booking-${b.tutor_id}-${b.subject_id}`,
          type: 'one-on-one',
          href: `/student/tutors/${b.tutor_id}`,
          title: subjectName,
          tutorName: tutorObj?.display_name || tutorObj?.full_name || 'Your Tutor',
          color,
          emoji,
        });
      }

      setLessons(result);
    } catch {
      setLessons([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <StudentShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">My Lessons</h1>
          <p className="text-sm text-muted-foreground mt-1">All your enrolled lessons in one place</p>
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-muted-foreground">Loading lessons…</div>
        ) : lessons.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border p-16 text-center">
            <BookOpen className="size-10 mx-auto text-muted-foreground/40" />
            <p className="mt-3 font-semibold text-ink">No lessons yet</p>
            <p className="text-sm text-muted-foreground mt-1">Find a tutor or join a group class to get started.</p>
            <Link href="/student/find-tutors" className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand/90">
              Find a Tutor
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lessons.map((l) => (
              <Link key={l.key} href={l.href}
                className="group rounded-3xl bg-background border border-border overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all">
                <div className="h-24 flex items-center justify-center text-4xl"
                  style={{ background: `linear-gradient(135deg, oklch(0.9 0.05 var(--${l.color}-h, 150)), oklch(0.95 0.03 var(--${l.color}-h, 150)))` }}>
                  {l.emoji}
                </div>
                <div className="p-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    {l.type === 'group' ? 'Group class' : '1-on-1'}
                  </div>
                  <div className="font-semibold text-ink mt-1 line-clamp-1">{l.title}</div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="size-3.5" /> {l.tutorName}
                    </div>
                    <ArrowRight className="size-4 text-brand-deep group-hover:translate-x-0.5 transition" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
