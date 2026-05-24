'use client';

import Link from 'next/link';
import { ChevronRight, FileText, AlertCircle, Check, Clock, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import ParentShell from '@/components/parent/ParentShell';
import { CHILDREN, paymentStatusForChild, type Child, type EnrollmentStatus } from '@/lib/mock';

const STATUS_BADGE: Record<EnrollmentStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-brand-soft text-brand-deep' },
  'awaiting-consent': { label: 'Awaiting consent', className: 'bg-amber-100 text-amber-700' },
  'awaiting-approval': { label: 'Awaiting approval', className: 'bg-sky text-ink' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
};

function ChildCard({ c }: { c: Child }) {
  const payStatus = paymentStatusForChild(c);
  const pendingConsents = c.enrollments.filter((e) => e.status === 'awaiting-consent').length;
  const shown = c.enrollments.slice(0, 3);
  const extra = c.enrollments.length - 3;

  return (
    <Link
      href={`/parent/children/${c.id}`}
      className="rounded-2xl border border-border bg-card p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-3"
    >
      <div className="flex items-center gap-3">
        <div
          className="size-11 rounded-full grid place-items-center text-white font-bold text-sm shrink-0"
          style={{ background: `oklch(0.65 0.15 ${c.hue})` }}
        >
          {c.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink truncate">{c.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {c.ageLabel} · {c.school}
          </p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
      </div>

      {shown.length > 0 && (
        <div className="space-y-1.5">
          {shown.map((e) => {
            const badge = STATUS_BADGE[e.status];
            return (
              <div key={e.classId} className="flex items-center gap-2 text-xs">
                <span>{e.classEmoji}</span>
                <span className="flex-1 text-ink truncate">{e.classTitle}</span>
                <span
                  className={cn(
                    'shrink-0 px-2 py-0.5 rounded-full font-medium',
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              </div>
            );
          })}
          {extra > 0 && <p className="text-xs text-muted-foreground">+{extra} more</p>}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-border">
        <div className="flex items-center gap-1 text-xs font-medium">
          {payStatus === 'all-paid' ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="size-3" /> All paid up
            </span>
          ) : payStatus === 'overdue' ? (
            <span className="inline-flex items-center gap-1 text-rose-600">
              <AlertCircle className="size-3" /> Overdue
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Clock className="size-3" /> Awaiting action
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {c.feedback.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3" /> {c.feedback.length} report
              {c.feedback.length !== 1 ? 's' : ''}
            </span>
          )}
          {pendingConsents > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
              <Clock className="size-3" /> {pendingConsents} pending
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function ChildrenPage() {
  return (
    <ParentShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">My children</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View each child&apos;s classes, feedback and billing status.
            </p>
          </div>
          <Link
            href="/parent/dashboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand/90 transition"
          >
            <Plus className="size-4" /> Add a child
          </Link>
        </div>

        {CHILDREN.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center gap-4 rounded-2xl border border-dashed border-border">
            <p className="font-semibold text-ink">No children added yet.</p>
            <Link
              href="/parent/dashboard"
              className="text-sm font-semibold text-brand-deep hover:underline"
            >
              Go to dashboard to add a child →
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {CHILDREN.map((c) => (
              <ChildCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </ParentShell>
  );
}
