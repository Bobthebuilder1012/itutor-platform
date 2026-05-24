'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

type MyClass = {
  id: string;
  title: string;
  subject: string;
  level: string;
  tutor: string;
  schedule: string;
  emoji: string;
  color: string;
  kind: 'group' | '1on1';
  nextSession: string;
  status: string;
};

const MY_CLASSES: MyClass[] = [
  {
    id: 'csec-maths-mastery',
    title: 'CSEC Maths Mastery',
    subject: 'Mathematics',
    level: 'CSEC',
    tutor: 'Mr. Ramdeen',
    schedule: 'Mondays · 5:00–7:00 PM',
    emoji: '🧮',
    color: 'brand',
    kind: 'group',
    nextSession: 'Mon 26 May · 5:00 PM',
    status: 'active',
  },
  {
    id: 'physics-power-hour',
    title: 'Physics Power Hour',
    subject: 'Physics',
    level: 'CSEC',
    tutor: 'Mr. Ramdeen',
    schedule: 'Wednesdays · 4:00–6:00 PM',
    emoji: '⚡',
    color: 'sky',
    kind: 'group',
    nextSession: 'Wed 28 May · 4:00 PM',
    status: 'active',
  },
  {
    id: 'maths-1on1',
    title: 'Maths 1:1 – Weekly',
    subject: 'Mathematics',
    level: 'CSEC',
    tutor: 'Mr. Ramdeen',
    schedule: 'Fridays · 3:00–4:00 PM',
    emoji: '📐',
    color: 'lavender',
    kind: '1on1',
    nextSession: 'Fri 30 May · 3:00 PM',
    status: 'active',
  },
];

const BANNER_CLASSES: Record<string, string> = {
  brand: 'from-emerald-500 to-teal-600',
  sky: 'from-sky-400 to-blue-600',
  lavender: 'from-violet-500 to-purple-600',
  coral: 'from-rose-400 to-pink-500',
  peach: 'from-orange-300 to-amber-400',
};

function ClassCard({ c }: { c: MyClass }) {
  const banner = BANNER_CLASSES[c.color] ?? BANNER_CLASSES.brand;

  return (
    <Link
      href={`/student/lessons/${c.id}`}
      className="group rounded-3xl border border-border bg-card overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col"
    >
      <div className={cn('relative h-24 bg-gradient-to-br flex items-end px-4 pb-3', banner)}>
        <div className="size-12 rounded-2xl bg-white/20 backdrop-blur grid place-items-center text-2xl">
          {c.emoji}
        </div>
        <span className="absolute top-3 right-3 text-xs font-semibold bg-white/20 text-white px-2.5 py-0.5 rounded-full">
          {c.kind === '1on1' ? '1:1' : 'Group'}
        </span>
      </div>

      <div className="flex-1 flex flex-col p-4 gap-2">
        <h3 className="font-semibold text-ink text-sm leading-snug">{c.title}</h3>
        <p className="text-xs text-muted-foreground">
          {c.subject} · {c.level}
        </p>
        <p className="text-xs text-muted-foreground">by {c.tutor}</p>

        <div className="mt-auto pt-3 border-t border-border space-y-1">
          <p className="text-xs text-muted-foreground">{c.schedule}</p>
          <p className="text-xs font-medium text-ink">Next: {c.nextSession}</p>
        </div>

        <div className="flex items-center justify-end">
          <span className="text-xs font-semibold text-brand-deep group-hover:underline">
            Open class →
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function MyLessonsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Classes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your enrolled classes and 1:1 sessions.
          </p>
        </div>
        <Link
          href="/student/classes"
          className="shrink-0 text-sm font-semibold text-brand-deep hover:underline"
        >
          Find more classes →
        </Link>
      </div>

      {MY_CLASSES.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center gap-3">
          <div className="size-14 rounded-2xl bg-muted grid place-items-center text-2xl">📚</div>
          <p className="font-semibold text-ink">You haven&apos;t joined any classes yet.</p>
          <Link
            href="/student/classes"
            className="text-sm font-semibold text-brand-deep hover:underline"
          >
            Browse the marketplace →
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MY_CLASSES.map((c) => (
            <ClassCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
