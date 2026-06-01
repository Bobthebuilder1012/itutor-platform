'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GraduationCap, FileText, Calendar, Clock, Check, AlertCircle, X, BookOpen, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import ParentShell from '@/components/parent/ParentShell';

type Enrollment = { groupId: string; name: string; subject: string | null; status: string; joinedAt: string | null };
type FeedbackReport = { id: string; month: string; tutorName: string; classTitle: string; body: string; deliveredAt: string; attendance: string };

export default function ChildDetailPage() {
  return <ParentShell><ChildContent /></ParentShell>;
}

function ChildContent() {
  const { childId } = useParams<{ childId: string }>();
  const { profile } = useProfile();
  const [tab, setTab] = useState<'classes' | 'feedback'>('classes');
  const [childName, setChildName] = useState('');
  const [initials, setInitials] = useState('');
  const [hue, setHue] = useState(145);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [feedback, setFeedback] = useState<FeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [openReport, setOpenReport] = useState<FeedbackReport | null>(null);

  useEffect(() => {
    if (!childId) return;
    (async () => {
      const { data: child } = await supabase.from('profiles').select('full_name, display_name').eq('id', childId).single();
      const name = (child as any)?.display_name || (child as any)?.full_name || 'Child';
      setChildName(name);
      setInitials(name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase());
      setHue([145, 200, 30, 280, 350][name.charCodeAt(0) % 5]);

      const { data: mems } = await supabase
        .from('group_members')
        .select('group_id, status, joined_at, group:groups!group_members_group_id_fkey(id, name, subject)')
        .eq('user_id', childId);

      setEnrollments((mems ?? []).map((m: any) => {
        const g = Array.isArray(m.group) ? m.group[0] : m.group;
        return { groupId: m.group_id, name: g?.name ?? 'Class', subject: g?.subject ?? null, status: m.status, joinedAt: m.joined_at };
      }));

      setLoading(false);
    })();
  }, [childId]);

  const activeCount = enrollments.filter(e => ['approved','active'].includes(e.status)).length;

  return (
    <div className="space-y-6">
      <Link href="/parent/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> All children
      </Link>

      <header className="rounded-2xl bg-background border border-border p-5 flex items-center gap-4">
        <div className="size-16 rounded-full grid place-items-center font-bold text-ink shrink-0 text-xl"
          style={{ background: `oklch(0.85 0.1 ${hue})` }}>{initials}</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-ink">{childName}</h1>
          <div className="text-sm text-muted-foreground mt-0.5">{activeCount} active class{activeCount !== 1 ? 'es' : ''}</div>
        </div>
      </header>

      <div className="inline-flex p-1 rounded-2xl bg-muted">
        {(['classes', 'feedback'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold capitalize transition',
              tab === t ? 'bg-background text-ink shadow-sm' : 'text-muted-foreground hover:text-ink')}>
            {t === 'classes' ? <GraduationCap className="size-4" /> : <FileText className="size-4" />}
            {t === 'classes' ? 'Classes' : 'Feedback'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2].map(i=><div key={i} className="h-32 rounded-2xl bg-muted animate-pulse"/>)}</div>
      ) : tab === 'classes' ? (
        <ClassesTab enrollments={enrollments} />
      ) : (
        <FeedbackTab feedback={feedback} onOpen={setOpenReport} />
      )}

      {openReport && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setOpenReport(null)}>
          <div className="bg-background w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <header className="sticky top-0 bg-background border-b border-border px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Monthly report</div>
                <div className="font-bold text-ink">{openReport.month} · {openReport.classTitle}</div>
              </div>
              <button onClick={() => setOpenReport(null)} className="size-8 rounded-full hover:bg-muted grid place-items-center"><X className="size-4"/></button>
            </header>
            <div className="p-6 space-y-4">
              <div className="text-sm text-muted-foreground">From <span className="font-semibold text-ink">{openReport.tutorName}</span></div>
              <p className="text-[15px] leading-relaxed text-ink whitespace-pre-wrap">{openReport.body}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClassesTab({ enrollments }: { enrollments: Enrollment[] }) {
  if (enrollments.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
        <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><BookOpen className="size-5"/></div>
        <h2 className="font-bold text-ink">No classes enrolled yet</h2>
        <p className="text-sm text-muted-foreground mt-1">Browse classes to get started.</p>
      </div>
    );
  }
  const statusMeta: Record<string, { label: string; cls: string }> = {
    active:   { label: 'Active',            cls: 'bg-brand-soft text-brand-deep' },
    approved: { label: 'Active',            cls: 'bg-brand-soft text-brand-deep' },
    pending:  { label: 'Awaiting approval', cls: 'bg-sky-100 text-sky-800' },
    banned:   { label: 'Banned',            cls: 'bg-rose-100 text-rose-700' },
    suspended:{ label: 'Suspended',         cls: 'bg-amber-100 text-amber-800' },
    removed:  { label: 'Removed',           cls: 'bg-muted text-muted-foreground' },
  };
  return (
    <div className="space-y-3">
      {enrollments.map((e) => {
        const sm = statusMeta[e.status] ?? { label: e.status, cls: 'bg-muted text-muted-foreground' };
        return (
          <article key={e.groupId} className="rounded-2xl bg-background border border-border p-5">
            <div className="flex items-start gap-4">
              <div className="size-12 rounded-2xl bg-muted grid place-items-center text-2xl shrink-0">📚</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-ink truncate">{e.name}</h3>
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap', sm.cls)}>{sm.label}</span>
                </div>
                {e.subject && <div className="text-xs text-muted-foreground mt-0.5">{e.subject}</div>}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              {e.joinedAt && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="size-3.5"/> Enrolled {new Date(e.joinedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
                </div>
              )}
              <Link href={`/student/classes/${e.groupId}`} className="text-xs font-semibold text-brand-deep hover:underline ml-auto">View class →</Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function FeedbackTab({ feedback, onOpen }: { feedback: FeedbackReport[]; onOpen: (r: FeedbackReport) => void }) {
  if (feedback.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
        <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><FileText className="size-5"/></div>
        <h2 className="font-bold text-ink">No reports yet</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">Tutors send monthly reports after each full month of enrolment.</p>
      </div>
    );
  }
  return (
    <ol className="space-y-3">
      {feedback.map((r) => (
        <li key={r.id}>
          <button onClick={() => onOpen(r)} className="w-full text-left rounded-2xl bg-background border border-border p-4 hover:border-brand-deep/40 transition flex items-center gap-3">
            <div className="size-10 rounded-xl bg-brand-soft text-brand-deep grid place-items-center shrink-0"><FileText className="size-4"/></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-ink truncate">{r.month} report · {r.classTitle}</h3>
                <ChevronRight className="size-4 text-muted-foreground"/>
              </div>
              <div className="text-xs text-muted-foreground">by {r.tutorName}</div>
            </div>
          </button>
        </li>
      ))}
    </ol>
  );
}
