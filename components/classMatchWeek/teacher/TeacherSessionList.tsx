'use client';

import { useState } from 'react';
import { Calendar, Clock, Users, Tag, Copy, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClassMatchSession, SessionStatus } from '@/lib/classMatchWeek/types';

/** A session as the teacher endpoint returns it — row plus resolved extras. */
export type TeacherSession = ClassMatchSession & {
  groupName: string;
  reservedCount: number;
};

/**
 * Render a timestamptz as Trinidad wall-clock. Never derive this from
 * `groups.timezone` — it reads 'UTC' on every row and is wrong. AST is the
 * only timezone the platform's times mean.
 */
function formatAst(iso: string): string {
  return new Date(iso).toLocaleString('en-TT', {
    timeZone: 'America/Port_of_Spain',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS_CHIP: Record<SessionStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-amber-100 text-amber-700' },
  published: { label: 'Published', className: 'bg-brand/10 text-brand-deep' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
};

/**
 * The teacher's sessions, cancelled ones included — muted, never deleted, so
 * the list stays an honest record of what was offered during the week.
 */
export default function TeacherSessionList({
  sessions,
  onCancel,
}: {
  sessions: TeacherSession[];
  /** Resolves to an error message, or null on success. */
  onCancel: (sessionId: string) => Promise<string | null>;
}) {
  // Soonest upcoming first; cancelled sink to the bottom in their own order.
  const ordered = [...sessions].sort((a, b) => {
    if ((a.status === 'cancelled') !== (b.status === 'cancelled')) {
      return a.status === 'cancelled' ? 1 : -1;
    }
    return a.scheduled_at.localeCompare(b.scheduled_at);
  });

  return (
    <div className="space-y-3">
      {ordered.map((s) => (
        <SessionCard key={s.id} session={s} onCancel={onCancel} />
      ))}
    </div>
  );
}

function SessionCard({
  session: s,
  onCancel,
}: {
  session: TeacherSession;
  onCancel: (sessionId: string) => Promise<string | null>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const cancelled = s.status === 'cancelled';
  const chip = STATUS_CHIP[s.status];

  const confirmCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    const err = await onCancel(s.id);
    setCancelling(false);
    if (err) setCancelError(err);
    else setConfirming(false);
  };

  const copyLink = () => {
    if (!s.meet_link) return;
    navigator.clipboard?.writeText(s.meet_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card p-4 space-y-3',
        cancelled && 'opacity-60'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-ink">{s.title}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.groupName}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            chip.className
          )}
        >
          {chip.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="size-3.5 text-brand-deep" />
          <span className="font-medium">{formatAst(s.scheduled_at)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5 text-brand-deep" />
          {s.duration_minutes} min
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5 text-brand-deep" />
          {s.reservedCount} reserved
          {' · '}
          {s.max_attendees == null ? 'Unlimited' : `cap ${s.max_attendees}`}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand-deep">
          <Tag className="size-3" />
          {s.discount_percent}% off for attendees
        </span>
      </div>

      {s.status === 'published' && s.meet_link && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {s.meet_link}
          </span>
          <button
            onClick={copyLink}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-deep hover:underline"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {!cancelled &&
        (confirming ? (
          <div className="rounded-xl border border-coral/30 bg-coral/5 p-3 space-y-2">
            <p className="text-xs text-ink">
              Families with reservations will NOT be emailed — the session simply stops showing as
              upcoming.
            </p>
            {cancelError && <p className="text-xs text-coral">{cancelError}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={confirmCancel}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {cancelling && <Loader2 className="size-3 animate-spin" />}
                {cancelling ? 'Cancelling…' : 'Cancel session'}
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  setCancelError(null);
                }}
                disabled={cancelling}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:bg-muted"
              >
                Keep session
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              onClick={() => setConfirming(true)}
              className="text-xs font-semibold text-coral hover:underline"
            >
              Cancel session
            </button>
          </div>
        ))}
    </div>
  );
}
