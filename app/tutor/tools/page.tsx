'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, Bot, Calculator, FileText } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import TutorShell from '@/components/tutor/TutorShell';

export default function TutorToolsPage() {
  return (
    <TutorShell>
      <ToolsContent />
    </TutorShell>
  );
}

function ToolsContent() {
  const router = useRouter();
  const { profile, loading } = useProfile();

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  const tools = [
    {
      id: 'marking',
      title: 'AI Marking',
      desc: 'Upload student work and an answer key, get suggested grades and feedback in minutes.',
      icon: FileText,
      href: '/tools/ai',
      available: true,
    },
    {
      id: 'lesson-planning',
      title: 'Lesson Planning',
      desc: 'Generate structured lesson plans, objectives, and activities tailored to your syllabus.',
      icon: Bot,
      href: '#',
      available: false,
    },
    {
      id: 'grader',
      title: 'Grade calculator',
      desc: 'Track student grades across multiple assessments with weighted averages.',
      icon: Calculator,
      href: '#',
      available: false,
    },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-soft text-brand-deep text-xs font-bold uppercase tracking-wider">
          <Sparkles className="size-3" /> AI tools
        </div>
        <h1 className="mt-3 text-2xl lg:text-3xl font-bold text-ink">iTutor tools</h1>
        <p className="text-sm text-muted-foreground mt-1">Free AI tools to help you teach more effectively.</p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((t) => {
          const Icon = t.icon;
          const inner = (
            <div className={`rounded-2xl border border-border bg-card p-5 h-full transition ${t.available ? 'hover:shadow-card cursor-pointer' : 'opacity-60'}`}>
              <div className="size-10 rounded-lg bg-brand/10 text-brand-deep grid place-items-center">
                <Icon className="size-5" />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="font-semibold text-ink">{t.title}</div>
                {!t.available && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-peach text-ink">Soon</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
              {t.available && (
                <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-deep">
                  Open <ArrowRight className="size-3" />
                </div>
              )}
            </div>
          );
          return t.available ? <Link key={t.id} href={t.href}>{inner}</Link> : <div key={t.id}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
