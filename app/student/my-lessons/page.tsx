'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Users, BookOpen } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';

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
  social:  { color: 'lavender',emoji: '🌍' },
  spanish: { color: 'coral',   emoji: '🇪🇸' },
  french:  { color: 'sky',     emoji: '🇫🇷' },
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

export default function CurriculumPage() {
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
      // Fetch 1:1 bookings and enrolled groups in parallel
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

      // Group lessons from server-side API (bypasses RLS)
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

      // 1:1 bookings (deduplicated by tutor + subject)
      const seen = new Set<string>();
      for (const row of bookingsRes.data || []) {
        const key = `${row.tutor_id}-${row.subject_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const tutor = Array.isArray(row.tutor) ? row.tutor[0] : row.tutor;
        const subject = Array.isArray(row.subject) ? row.subject[0] : row.subject;
        const subjectName = subject?.label || subject?.name || 'Unknown Subject';
        const { color, emoji } = getMeta(subjectName);
        result.push({
          key,
          type: 'one-on-one',
          href: `/student/tutors/${row.tutor_id}`,
          title: subjectName,
          tutorName: tutor?.display_name || tutor?.full_name || 'Unknown Tutor',
          color,
          emoji,
        });
      }

      setLessons(result);
    } catch (err) {
      console.error('Failed to load lessons:', err);
    } finally {
      setLoading(false);
    }
  }

  if (profileLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">My Lessons</h1>
          <p className="text-sm text-muted-foreground mt-1">All your enrolled lessons in one place</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-3xl bg-background border border-border overflow-hidden animate-pulse">
              <div className="h-24 bg-muted" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-muted rounded w-16" />
                <div className="h-4 bg-muted rounded w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">My Lessons</h1>
          <p className="text-sm text-muted-foreground mt-1">All your enrolled lessons in one place</p>
        </div>
        <div className="text-center py-20">
          <div className="text-4xl mb-3">📚</div>
          <p className="font-semibold text-ink">No lessons yet</p>
          <p className="text-sm text-muted-foreground mt-1">Book a 1:1 session or join a group lesson to get started</p>
          <Link href="/student/find-tutors" className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-2xl bg-brand text-white font-semibold text-sm hover:bg-brand-deep transition">
            Explore lessons
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">My Lessons</h1>
        <p className="text-sm text-muted-foreground mt-1">All your enrolled lessons in one place</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {lessons.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            className="group rounded-3xl bg-background border border-border overflow-hidden hover:shadow-card hover:-translate-y-0.5 transition-all"
          >
            <div
              className="h-24 flex items-center justify-center text-4xl relative"
              style={{ background: `linear-gradient(135deg, color-mix(in oklab, var(--${l.color}) 35%, white), color-mix(in oklab, var(--${l.color}) 15%, white))` }}
            >
              {l.emoji}
              <span className={`absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${l.type === 'group' ? 'bg-brand text-white' : 'bg-ink/80 text-white'}`}>
                {l.type === 'group' ? 'Group' : '1:1'}
              </span>
            </div>
            <div className="p-4">
              <div className="font-semibold text-ink leading-tight">{l.title}</div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {l.type === 'group' ? <BookOpen className="size-3.5" /> : <Users className="size-3.5" />}
                  {l.tutorName}
                </div>
                <ArrowRight className="size-4 text-brand-deep group-hover:translate-x-0.5 transition" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
