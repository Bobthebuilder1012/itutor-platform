'use client';

// Parent feedback — handover §9.1.
//
// Feedback already reaches a parent by email and in-app notification. This is
// the standing record, so a report read once on a phone in September can still
// be found in November.
//
// SPARSITY IS NORMAL AND THE PAGE SAYS SO
// §8 makes feedback optional and pull-based, and most classes produce none. An
// empty page that looks like a failure would push parents to chase tutors, which
// is exactly the pressure decision 12 removed. So the empty state states the
// model instead of apologising for it.
//
// Nothing here shows a due date. §8.1 bans "pending", "expected" and progress
// indicators, so an outstanding request shows the date it was made and nothing
// more — a countdown would promise a response the platform never guarantees.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Loader2, MessageSquare, MessageSquareQuote } from 'lucide-react';
import ParentShell from '@/components/parent/ParentShell';
import RequestFeedbackPanel from '@/components/parent/RequestFeedbackPanel';

type Report = {
  id: string;
  childName: string;
  tutorName: string;
  date: string;
  edited: boolean;
  editedOn: string;
  answeredARequest: boolean;
  attendance: {
    label: string | null;
    attended: number | null;
    late: number | null;
    absent: number | null;
    cancelled: number | null;
    excluded: number | null;
  };
  attendanceNote: string | null;
  participationLabel: string;
  sections: Array<{ key: string; label: string; body: string }>;
};

type OpenRequest = {
  id: string;
  childName: string;
  tutorName: string;
  requestedOn: string;
  byYou: boolean;
};

export default function ParentFeedbackPage() {
  return (
    <ParentShell>
      <FeedbackContent />
    </ParentShell>
  );
}

function FeedbackContent() {
  const [reports, setReports] = useState<Report[]>([]);
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([]);
  const [hasChildren, setHasChildren] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/parent/feedback/reports', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) {
        setReports(json.reports ?? []);
        setOpenRequests(json.openRequests ?? []);
        setHasChildren(Boolean(json.hasChildren));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What your children’s tutors have written. You and your child share one request a month per
          tutor.
        </p>
        {/* The kit titles this surface "Feedback & messages" and renders feedback
            as cards inside each tutor thread. Split here into two pages rather
            than merged, so the link is explicit instead of a parent wondering
            where they reply. */}
        <Link
          href="/parent/messages"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
        >
          <MessageSquare className="size-4" />
          Message a tutor
        </Link>
      </header>

      {hasChildren && <RequestFeedbackPanel />}

      {!hasChildren && (
        <div className="rounded-2xl border border-border bg-background p-6">
          <p className="text-sm text-ink">No children are linked to your account yet.</p>
        </div>
      )}

      {/* Outstanding requests: the date asked, and nothing else. */}
      {openRequests.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3"
        >
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm text-ink">
            {r.byYou ? 'You' : r.childName} asked {r.tutorName} for feedback on {r.requestedOn}.
          </span>
          <span className="text-xs text-muted-foreground">
            Tutors answer in their own time — nothing chases them.
          </span>
        </div>
      ))}

      {hasChildren && reports.length === 0 && (
        <div className="rounded-2xl border border-border bg-background p-6">
          <MessageSquareQuote className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-ink">No feedback yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Most classes produce none — tutors write it when there is something worth saying, or when
            you ask. Attendance is tracked either way, on each child’s page.
          </p>
        </div>
      )}

      {reports.map((f) => (
        <article key={f.id} className="rounded-2xl border border-border bg-background p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-ink">
              {f.childName} · {f.tutorName}
            </h2>
            <span className="text-xs text-muted-foreground">{f.date}</span>
          </div>

          <div className="mt-1 flex flex-wrap gap-2">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
              {f.answeredARequest ? 'You asked' : 'Sent unprompted'}
            </span>
            {/* §8.2: an edit is surfaced, never silent. A parent who read the
                first version needs to know a second exists. */}
            {f.edited && (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                Edited {f.editedOn}
              </span>
            )}
          </div>

          {/* Attendance: automatic, and labelled as such so nobody asks the
              tutor to change it. */}
          {f.attendance.label && (
            <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Attendance · recorded automatically
              </div>
              <div className="text-lg font-extrabold tabular-nums text-ink">
                {f.attendance.label}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {f.attendance.attended ?? 0} attended · {f.attendance.late ?? 0} late ·{' '}
                {f.attendance.absent ?? 0} absent
                {(f.attendance.cancelled ?? 0) > 0 && ` · ${f.attendance.cancelled} cancelled`}
              </div>
              {(f.attendance.excluded ?? 0) > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {f.attendance.excluded} session{f.attendance.excluded === 1 ? '' : 's'} not counted
                  — the class did not run.
                </div>
              )}
            </div>
          )}

          {f.attendanceNote && (
            <p className="mt-2 text-sm text-ink/80">
              <span className="text-muted-foreground">Tutor’s note: </span>
              {f.attendanceNote}
            </p>
          )}

          <p className="mt-3 text-sm text-ink/80">
            <span className="text-muted-foreground">Participation: </span>
            {f.participationLabel}
          </p>

          {f.sections.map((s) => (
            <div key={s.key} className="mt-3 border-t border-border pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink/80">{s.body}</p>
            </div>
          ))}

          <p className="mt-3 text-xs text-muted-foreground">
            Sent to you and to {f.childName.split(' ')[0]}.
          </p>
        </article>
      ))}
    </div>
  );
}
