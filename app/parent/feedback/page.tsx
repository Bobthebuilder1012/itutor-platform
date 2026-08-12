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
import { Clock, Loader2, MessageSquareQuote } from 'lucide-react';
import ParentShell from '@/components/parent/ParentShell';

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
      <div className="flex justify-center py-24 text-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Feedback</h1>
        <p className="mt-1 text-sm text-muted">
          What your children’s tutors have written. You and your child share one request a month per
          tutor.
        </p>
      </header>

      {!hasChildren && (
        <div className="rounded-2xl border border-white/10 bg-card p-6">
          <p className="text-sm text-white">No children are linked to your account yet.</p>
        </div>
      )}

      {/* Outstanding requests: the date asked, and nothing else. */}
      {openRequests.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-card px-4 py-3"
        >
          <Clock className="h-4 w-4 shrink-0 text-muted" />
          <span className="text-sm text-white">
            {r.byYou ? 'You' : r.childName} asked {r.tutorName} for feedback on {r.requestedOn}.
          </span>
          <span className="text-xs text-muted">
            Tutors answer in their own time — nothing chases them.
          </span>
        </div>
      ))}

      {hasChildren && reports.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-card p-6">
          <MessageSquareQuote className="h-8 w-8 text-muted" />
          <p className="mt-3 text-sm text-white">No feedback yet.</p>
          <p className="mt-1 text-sm text-muted">
            Most classes produce none — tutors write it when there is something worth saying, or when
            you ask. Attendance is tracked either way, on each child’s page.
          </p>
        </div>
      )}

      {reports.map((f) => (
        <article key={f.id} className="rounded-2xl border border-white/10 bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-white">
              {f.childName} · {f.tutorName}
            </h2>
            <span className="text-xs text-muted">{f.date}</span>
          </div>

          <div className="mt-1 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-muted">
              {f.answeredARequest ? 'You asked' : 'Sent unprompted'}
            </span>
            {/* §8.2: an edit is surfaced, never silent. A parent who read the
                first version needs to know a second exists. */}
            {f.edited && (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                Edited {f.editedOn}
              </span>
            )}
          </div>

          {/* Attendance: automatic, and labelled as such so nobody asks the
              tutor to change it. */}
          {f.attendance.label && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Attendance · recorded automatically
              </div>
              <div className="text-lg font-extrabold tabular-nums text-white">
                {f.attendance.label}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {f.attendance.attended ?? 0} attended · {f.attendance.late ?? 0} late ·{' '}
                {f.attendance.absent ?? 0} absent
                {(f.attendance.cancelled ?? 0) > 0 && ` · ${f.attendance.cancelled} cancelled`}
              </div>
              {(f.attendance.excluded ?? 0) > 0 && (
                <div className="mt-1 text-xs text-muted">
                  {f.attendance.excluded} session{f.attendance.excluded === 1 ? '' : 's'} not counted
                  — the class did not run.
                </div>
              )}
            </div>
          )}

          {f.attendanceNote && (
            <p className="mt-2 text-sm text-white/80">
              <span className="text-muted">Tutor’s note: </span>
              {f.attendanceNote}
            </p>
          )}

          <p className="mt-3 text-sm text-white/80">
            <span className="text-muted">Participation: </span>
            {f.participationLabel}
          </p>

          {f.sections.map((s) => (
            <div key={s.key} className="mt-3 border-t border-white/5 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {s.label}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-white/85">{s.body}</p>
            </div>
          ))}

          <p className="mt-3 text-xs text-muted">
            Sent to you and to {f.childName.split(' ')[0]}.
          </p>
        </article>
      ))}
    </div>
  );
}
