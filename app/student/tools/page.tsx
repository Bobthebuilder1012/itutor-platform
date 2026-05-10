'use client';

import Link from 'next/link';
import { BookOpen, Calculator, Sparkles, Clock, GraduationCap, Brain, Wrench, LayoutList } from 'lucide-react';

const TOOLS = [
  {
    name: 'Curriculum',
    desc: 'All your enrolled lessons and subjects in one place',
    icon: LayoutList,
    tint: 'bg-sky',
    iconColor: 'text-ink',
    href: null,
    comingSoon: true,
  },
  {
    name: 'Practice Quiz',
    desc: 'Adaptive questions with instant feedback and progress tracking',
    icon: Sparkles,
    tint: 'bg-coral-soft',
    iconColor: 'text-coral',
    href: null,
    comingSoon: true,
  },
  {
    name: 'Scientific Calculator',
    desc: 'Full scientific & graphing calculator built in',
    icon: Calculator,
    tint: 'bg-lavender',
    iconColor: 'text-ink',
    href: null,
    comingSoon: true,
  },
  {
    name: 'Formula Sheet',
    desc: 'Quick reference cards for every subject',
    icon: BookOpen,
    tint: 'bg-brand-soft',
    iconColor: 'text-brand-deep',
    href: null,
    comingSoon: true,
  },
  {
    name: 'Pomodoro Timer',
    desc: '25-minute focused study sessions with breaks',
    icon: Clock,
    tint: 'bg-peach',
    iconColor: 'text-ink',
    href: null,
    comingSoon: true,
  },
  {
    name: 'Flashcards',
    desc: 'Make and study flashcards with spaced repetition',
    icon: Brain,
    tint: 'bg-coral-soft',
    iconColor: 'text-coral',
    href: null,
    comingSoon: true,
  },
];

export default function ToolsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-2xl bg-lavender grid place-items-center">
          <Wrench className="size-5 text-ink" />
        </div>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">Tools</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Everything you need to study smarter</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {TOOLS.map((t) => {
          const inner = (
            <>
              <div className="flex items-start justify-between mb-3">
                <div className={`size-12 rounded-2xl ${t.tint} grid place-items-center group-hover:scale-105 transition`}>
                  <t.icon className={`size-5 ${t.iconColor}`} />
                </div>
                {t.comingSoon && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-muted text-muted-foreground">
                    Coming soon
                  </span>
                )}
              </div>
              <div className={`font-semibold ${t.comingSoon ? 'text-muted-foreground' : 'text-ink'}`}>{t.name}</div>
              <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
            </>
          );

          return t.href ? (
            <Link
              key={t.name}
              href={t.href}
              className="text-left rounded-3xl bg-background border border-border p-5 hover:shadow-card hover:-translate-y-0.5 transition group block"
            >
              {inner}
            </Link>
          ) : (
            <div
              key={t.name}
              className="text-left rounded-3xl bg-background border border-border p-5 opacity-60 cursor-not-allowed"
            >
              {inner}
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-brand-soft via-background to-coral-soft border border-border p-6 flex items-center gap-4">
        <div className="size-12 rounded-2xl bg-background grid place-items-center shadow-sm">
          <GraduationCap className="size-5 text-brand-deep" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-ink">Need help with a specific topic?</div>
          <p className="text-sm text-muted-foreground mt-0.5">Find a tutor who specialises in what you&apos;re studying.</p>
        </div>
        <Link href="/student/find-tutors" className="px-4 py-2 rounded-xl bg-ink text-white text-sm font-semibold hover:bg-forest transition">
          Browse
        </Link>
      </div>
    </div>
  );
}
