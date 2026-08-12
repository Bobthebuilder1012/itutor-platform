'use client';

// Tutor feedback surface — handover §9.3 and the §8.2 template.
//
// A NEW destination rather than a rebuild of /tutor/students. §9.3 places this
// on the class Students tab and on My Students; both of those pages already
// exist and do other jobs, and the standing instruction on this workstream is to
// add rather than renovate. So this is the aggregate roster §9.3 asks for
// ("across group and 1:1, since 1:1 students belong to no class") with the
// composer attached, and the existing pages are untouched.
//
// TWO RULES THE UI ENFORCES BY WHAT IT DOES NOT OFFER
//
// 1. Attendance is a report, not a form. §9.3: "No checkboxes, no dropdowns, no
//    hover-to-edit, no context menu, no 'mark all present'. A tutor who sees an
//    editable cell will attempt a correction and find it impossible." So the
//    attendance block here is text, with a badge saying it was filled in
//    automatically, and there is nothing to click.
//
// 2. Nothing implies a deadline. §8.1 bans "pending", "expected" and any
//    progress language, and there is no reminder mechanism behind this screen.
//    An open request shows the date it was made and nothing else.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquareQuote, Send } from 'lucide-react';
import TutorShell from '@/components/tutor/TutorShell';

type Attendance = {
  label: string;
  rate: number | null;
  counted: number;
  attended: number;
  late: number;
  absent: number;
  cancelled: number;
  excluded: number;
};

type Student = {
  id: string;
  name: string;
  avatar: string | null;
  formLevel: string | null;
  via: string | null;
  parentName: string | null;
  attendance: Attendance | null;
  openRequest: { id: string; requestedAt: string; by: string } | null;
};

const PARTICIPATION = [
  { value: 'yes', label: 'Yes' },
  { value: 'occasionally', label: 'Occasionally' },
  { value: 'not_often', label: 'Not often' },
  { value: 'never_recall', label: 'I can’t recall the student ever participating' },
] as const;

/** §12.2 is unresolved, so the section list is data, not markup. */
const DEFAULT_SECTIONS = [
  { key: 'performance', label: 'Performance', placeholder: 'What went well, what still slips.' },
  { key: 'focus', label: 'Focus next', placeholder: 'What you’ll work on next session.' },
];

export default function TutorFeedbackPage() {
  return (
    <TutorShell>
      <FeedbackContent />
    </TutorShell>
  );
}

function FeedbackContent() {
  const [students, setStudents] = useState<Student[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [composingFor, setComposingFor] = useState<Student | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/feedback/roster', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) {
        setStudents(json.students ?? []);
        setOpenCount(json.openRequests ?? 0);
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
      <div className="flex justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone you teach, group classes and 1:1 together.{' '}
          {openCount > 0
            ? `${openCount} ${openCount === 1 ? 'family has' : 'families have'} asked for an update.`
            : 'Nobody is waiting on you — you can still write feedback unprompted.'}
        </p>
      </header>

      {toast && (
        <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-ink">
          {toast}
        </div>
      )}

      {students.length === 0 && (
        <div className="rounded-2xl border border-border p-6">
          <p className="text-sm text-ink">No students yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Once someone joins a class or books a session, they appear here.
          </p>
        </div>
      )}

      {students.map((s) => (
        <article key={s.id} className="rounded-2xl border border-border p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-ink">{s.name}</span>
                {s.formLevel && (
                  <span className="text-xs text-muted-foreground">{s.formLevel}</span>
                )}
              </div>

              {/* Attendance: a report. Nothing here is clickable. */}
              {s.attendance && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Attendance <strong className="tabular-nums text-ink">{s.attendance.label}</strong>
                  {s.attendance.excluded > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {s.attendance.excluded} not counted (class didn’t run)
                    </span>
                  )}
                </p>
              )}

              {/* Name only — no contact details, by design (§9.3). */}
              {s.parentName && (
                <p className="mt-0.5 text-xs text-muted-foreground">Parent: {s.parentName}</p>
              )}
              {s.via && <p className="mt-0.5 text-xs text-muted-foreground">{s.via}</p>}

              {s.openRequest && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-600">
                  <MessageSquareQuote className="size-3" />
                  Feedback requested {s.openRequest.requestedAt} by{' '}
                  {s.openRequest.by === 'parent' ? 'parent' : 'student'}
                </span>
              )}
            </div>

            <button
              onClick={() => setComposingFor(s)}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                s.openRequest
                  ? 'bg-brand text-white hover:bg-brand/90'
                  : 'border border-border text-ink hover:bg-muted'
              }`}
            >
              Send feedback
            </button>
          </div>
        </article>
      ))}

      <p className="text-xs text-muted-foreground">
        Open requests sort first. Feedback is optional — most classes produce none, and nothing
        chases you for it.
      </p>

      {composingFor && (
        <FeedbackComposer
          student={composingFor}
          onClose={() => setComposingFor(null)}
          onSent={(message) => {
            setComposingFor(null);
            setToast(message);
            window.setTimeout(() => setToast(null), 6000);
            void load();
          }}
        />
      )}
    </div>
  );
}

function FeedbackComposer({
  student,
  onClose,
  onSent,
}: {
  student: Student;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [participation, setParticipation] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const first = student.name.split(' ')[0];
  const recipients = student.parentName ? `${student.parentName} and ${first}` : first;

  const submit = async () => {
    if (!participation) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId: student.id,
          requestId: student.openRequest?.id ?? null,
          participation,
          attendanceNote: note.trim() || null,
          sections: DEFAULT_SECTIONS.map((s) => ({
            key: s.key,
            label: s.label,
            body: bodies[s.key] ?? '',
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? json.error ?? 'Could not send that.');
        return;
      }
      onSent(`Feedback sent to ${recipients}.`);
    } catch {
      setError('Could not send that.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-background p-5 shadow-xl">
        <h2 className="text-lg font-bold text-ink">Feedback for {first}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Reaches {recipients}. Takes a couple of minutes.
        </p>

        {student.openRequest && (
          <p className="mt-3 rounded-xl border border-purple-500/25 bg-purple-500/10 px-3 py-2.5 text-xs text-purple-700">
            {student.openRequest.by === 'parent' ? student.parentName ?? 'A parent' : first} asked for
            this on {student.openRequest.requestedAt}. They asked for a general update on how {first}{' '}
            is doing.
          </p>
        )}

        {/* 1. Attendance — filled in, and not editable by anyone. */}
        <section className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-ink">Attendance</h3>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Filled in for you · not editable
            </span>
          </div>
          {student.attendance ? (
            <div className="mt-2 rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-lg font-extrabold tabular-nums text-ink">
                {student.attendance.label}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {student.attendance.attended} attended · {student.attendance.late} late ·{' '}
                {student.attendance.absent} absent
                {student.attendance.cancelled > 0 && ` · ${student.attendance.cancelled} cancelled`}
              </div>
              {student.attendance.excluded > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {student.attendance.excluded} session
                  {student.attendance.excluded === 1 ? '' : 's'} excluded because the class did not
                  run.
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No sessions recorded yet.</p>
          )}

          <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor="att-note">
            Anything the numbers miss? (optional)
          </label>
          <input
            id="att-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="The late arrival on 23 Aug was a school event, not a habit."
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-ink placeholder:text-muted-foreground focus:border-brand focus:outline-none"
          />
        </section>

        {/* 2. Participation — required, four fixed options, §8.2 wording. */}
        <section className="mt-5">
          <h3 className="text-sm font-bold text-ink">Did {first} participate?</h3>
          <div className="mt-2 grid gap-2">
            {PARTICIPATION.map((o) => (
              <button
                key={o.value}
                onClick={() => setParticipation(o.value)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  participation === o.value
                    ? 'border-brand bg-brand/5 font-semibold text-ink'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <span
                  className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${
                    participation === o.value ? 'border-brand' : 'border-border'
                  }`}
                >
                  {participation === o.value && <span className="size-2 rounded-full bg-brand" />}
                </span>
                {o.label}
              </button>
            ))}
          </div>
        </section>

        {/* 3. Free text — §12.2 open, so rendered from the section list. */}
        <section className="mt-5">
          <h3 className="text-sm font-bold text-ink">In your own words</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Optional. No homework or assignment fields — iTutor does not track either.
          </p>
          <div className="mt-2 grid gap-3">
            {DEFAULT_SECTIONS.map((s) => (
              <div key={s.key}>
                <label className="block text-xs font-medium text-muted-foreground" htmlFor={s.key}>
                  {s.label}
                </label>
                <textarea
                  id={s.key}
                  rows={3}
                  value={bodies[s.key] ?? ''}
                  onChange={(e) => setBodies((b) => ({ ...b, [s.key]: e.target.value }))}
                  placeholder={s.placeholder}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-ink placeholder:text-muted-foreground focus:border-brand focus:outline-none"
                />
              </div>
            ))}
          </div>
        </section>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-600">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button
            onClick={submit}
            disabled={!participation || saving}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send feedback
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink"
          >
            Cancel
          </button>
          <span className="text-xs text-muted-foreground">
            {participation ? `Goes to ${recipients}.` : 'Pick a participation answer to send.'}
          </span>
        </div>
      </div>
    </div>
  );
}
