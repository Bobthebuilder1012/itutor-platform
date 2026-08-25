'use client';

// The §8.2 feedback template. Lifted out of /tutor/feedback when that page and
// My Students merged into Clients — the composer itself is unchanged, because
// the template is the part the whole feedback system agrees on: participation
// is required, attendance is frozen server-side, and there are no homework or
// assignment fields because iTutor tracks neither.
//
// TWO RULES IT ENFORCES BY WHAT IT DOES NOT OFFER
//
// 1. Attendance is a report, not a form. §9.3: "No checkboxes, no dropdowns, no
//    hover-to-edit, no context menu, no 'mark all present'. A tutor who sees an
//    editable cell will attempt a correction and find it impossible." The block
//    below is text with a badge saying it was filled in automatically, and
//    there is nothing to click. The server generates the snapshot; migration
//    222's trigger refuses a client-supplied one.
//
// 2. Nothing implies a deadline. §8.1 bans "pending", "expected" and progress
//    language, and no reminder exists behind this screen. An open request shows
//    the date it was made and nothing else.

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';

export type ComposerAttendance = {
  label: string;
  attended: number;
  late: number;
  absent: number;
  cancelled: number;
  excluded: number;
};

export type ComposerStudent = {
  id: string;
  name: string;
  parentName: string | null;
  attendance: ComposerAttendance | null;
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

export default function FeedbackComposer({
  student,
  onClose,
  onSent,
}: {
  student: ComposerStudent;
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
