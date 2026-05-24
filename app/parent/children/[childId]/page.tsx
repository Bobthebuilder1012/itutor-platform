'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Check, AlertCircle, Clock, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHILDREN, type Child, type ChildEnrollment, type FeedbackReport } from '@/lib/mock';
import ParentShell from '@/components/parent/ParentShell';

export default function ChildDetailPage() {
  return (
    <ParentShell>
      <ChildDetail />
    </ParentShell>
  );
}

function ChildDetail() {
  const { childId } = useParams<{ childId: string }>();
  const child = CHILDREN.find((c) => c.id === childId);

  if (!child) {
    return (
      <div className="text-center py-20">
        <h1 className="text-xl font-bold text-ink">Child not found</h1>
        <Link href="/parent/children" className="mt-3 inline-block text-brand-deep font-semibold">← Back</Link>
      </div>
    );
  }

  const active = child.enrollments.filter((e) => e.status === 'active');
  const pending = child.enrollments.filter((e) => e.status === 'awaiting-consent' || e.status === 'awaiting-approval');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/parent/children" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> My children
      </Link>

      <div className="flex items-center gap-4">
        <div className="size-16 rounded-full grid place-items-center font-bold text-xl text-ink shrink-0"
          style={{ background: `oklch(0.85 0.1 ${child.hue})` }}>
          {child.initials}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">{child.name}</h1>
          <p className="text-sm text-muted-foreground">{child.ageLabel}{child.school ? ` · ${child.school}` : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Active classes" value={String(active.length)} />
        <Stat label="Pending" value={String(pending.length)} />
        <Stat label="Reports" value={String(child.feedback.length)} />
      </div>

      <section className="space-y-3">
        <h2 className="font-bold text-ink">Classes</h2>
        {child.enrollments.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-8 text-center">
            <GraduationCap className="size-8 mx-auto text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">Not enrolled in any classes yet.</p>
            <Link href="/parent/classes" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-deep hover:underline">
              Browse classes →
            </Link>
          </div>
        ) : (
          child.enrollments.map((e) => <EnrollmentCard key={e.classId} e={e} />)
        )}
      </section>

      {child.feedback.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold text-ink">Parent feedback reports</h2>
          {child.feedback.map((f) => <FeedbackCard key={f.id} f={f} />)}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background border border-border p-4 text-center">
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold text-ink mt-1">{value}</div>
    </div>
  );
}

function EnrollmentCard({ e }: { e: ChildEnrollment }) {
  const statusMeta = {
    'active': { label: 'Active', cls: 'bg-brand-soft text-brand-deep' },
    'awaiting-consent': { label: 'Consent required', cls: 'bg-amber-100 text-amber-800' },
    'awaiting-approval': { label: 'Awaiting approval', cls: 'bg-sky text-ink' },
    'cancelled': { label: 'Ended', cls: 'bg-muted text-muted-foreground' },
  }[e.status];

  return (
    <div className="rounded-2xl bg-background border border-border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{e.classEmoji}</span>
          <div>
            <div className="font-semibold text-ink">{e.classTitle}</div>
            <div className="text-xs text-muted-foreground">{e.tutorName} · {e.subject}</div>
          </div>
        </div>
        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0', statusMeta.cls)}>
          {statusMeta.label}
        </span>
      </div>

      <div className="text-sm text-muted-foreground space-y-1">
        <div>{e.schedule}</div>
        <div>TT${e.price}/{e.billing === 'per-month' ? 'month' : 'session'}</div>
        {e.nextSession && e.nextSession !== '—' && (
          <div className="text-brand-deep font-semibold">Next: {e.nextSession}</div>
        )}
        {e.paidThrough && (
          <div className="text-emerald-700 text-xs font-semibold inline-flex items-center gap-1">
            <Check className="size-3" /> Paid through {e.paidThrough}
          </div>
        )}
      </div>

      {e.status === 'awaiting-consent' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-800 font-semibold">
            <AlertCircle className="size-4 shrink-0" /> Consent & payment required
          </div>
          <button className="text-xs font-bold px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-deep">
            Pay & enroll
          </button>
        </div>
      )}
      {e.status === 'awaiting-approval' && (
        <div className="rounded-xl border border-sky bg-sky/30 p-3 flex items-center gap-2 text-xs text-ink font-semibold">
          <Clock className="size-4 shrink-0" /> Awaiting tutor approval
        </div>
      )}
    </div>
  );
}

function FeedbackCard({ f }: { f: FeedbackReport }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl bg-background border border-border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-ink">{f.month}</div>
          <div className="text-xs text-muted-foreground">{f.classTitle} · {f.tutorName}</div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <Check className="size-3 text-brand-deep" />
          {f.stats.sessionsAttended}/{f.stats.sessionsScheduled} sessions · {f.stats.attendance}
        </div>
      </div>

      <p className={cn('text-sm text-muted-foreground leading-relaxed', !expanded && 'line-clamp-3')}>{f.body}</p>

      <button onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
        {expanded ? <><ChevronUp className="size-3" /> Show less</> : <><ChevronDown className="size-3" /> Read full report</>}
      </button>
    </div>
  );
}

