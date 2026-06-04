'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderOpen, Upload, FileText, BookOpen } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import TutorShell from '@/components/tutor/TutorShell';

export default function TutorResourcesPage() {
  return (
    <TutorShell>
      <ResourcesContent />
    </TutorShell>
  );
}

function ResourcesContent() {
  const router = useRouter();
  const { profile, loading } = useProfile();

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">Resources</h1>
          <p className="text-sm text-muted-foreground mt-1">Notes, worksheets, and reference materials for your sessions.</p>
        </div>
        <button disabled className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-semibold opacity-60 cursor-not-allowed">
          <Upload className="size-4" /> Upload (soon)
        </button>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/tutor/curriculum" className="rounded-2xl border border-border bg-card p-5 hover:shadow-card transition">
          <div className="size-10 rounded-lg bg-brand/10 text-brand-deep grid place-items-center">
            <BookOpen className="size-5" />
          </div>
          <div className="mt-3 font-semibold text-ink">Curriculum & syllabi</div>
          <p className="text-xs text-muted-foreground mt-1">Browse CSEC and CAPE syllabi to plan your lessons.</p>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-5 opacity-60">
          <div className="size-10 rounded-lg bg-brand/10 text-brand-deep grid place-items-center">
            <FolderOpen className="size-5" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="font-semibold text-ink">My resources</div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-peach text-ink">Soon</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Upload PDFs, notes, and worksheets to share with students.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 opacity-60">
          <div className="size-10 rounded-lg bg-brand/10 text-brand-deep grid place-items-center">
            <FileText className="size-5" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="font-semibold text-ink">Past papers library</div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-peach text-ink">Soon</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Searchable library of past CSEC, CAPE, and SEA papers.</p>
        </div>
      </div>
    </div>
  );
}
