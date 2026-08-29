'use client';

/**
 * The attendance sheet. §6.
 *
 * A ROUTE, NOT A MODAL, and that is the whole design premise. The tutor is
 * standing in a room with a phone: the screen has to survive a refresh, a
 * dropped signal and being reopened from a notification. A modal survives none
 * of those — closing the tab loses the marks.
 *
 * Field conditions the layout answers to (§11): phone width with no horizontal
 * scroll, large tap targets, and a save that does not block on the network.
 *
 * ── GROUPED BY EVIDENCE, NOT BY SEAT ───────────────────────────────────────
 * The filter is Online / In person, and a student appears under whichever the
 * evidence says. A physical-seat student who joined the call shows under Online
 * with their seat noted, so the tutor can see the mismatch. Nothing needs
 * approving — it is one session, not a change of plan.
 *
 * ── SAVE ON SAVE, NOT PER TAP ──────────────────────────────────────────────
 * Marking is fast and often corrected mid-flow ("no, he came in late"). Writing
 * per tap would send a request per correction over a bad connection and make
 * the last one win by arrival order rather than by intent. One button, one
 * write, and the button says whether it has reached the server.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, WifiOff } from 'lucide-react';
import TutorShell from '@/components/tutor/TutorShell';

type Mark = 'attended' | 'late' | 'absent';
type Mode = 'online' | 'in_person';

interface Row {
  student_id: string;
  name: string;
  avatar_url: string | null;
  seat_type: 'online' | 'physical';
  mode: Mode | null;
  status: Mark | null;
  joined_at: string | null;
  note: string | null;
  marked: boolean;
}

const MARK_LABEL: Record<Mark, string> = {
  attended: 'Present',
  late: 'Late',
  absent: 'Absent',
};

export default function AttendancePage() {
  const params = useParams<{ id: string; occurrenceId: string }>();
  const router = useRouter();
  const groupId = params?.id as string;
  const occurrenceId = params?.occurrenceId as string;

  const [rows, setRows] = useState<Row[]>([]);
  const [occurrence, setOccurrence] = useState<any>(null);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Mode>('in_person');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/occurrences/${occurrenceId}/attendance`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        router.push(`/tutor/classes/${groupId}`);
        return;
      }
      const json = await res.json();
      setRows(json.students ?? []);
      setOccurrence(json.occurrence ?? null);
      setGroupName(json.group?.name ?? '');
      // Open on the half that needs work. The online half arrives pre-filled
      // from join clicks; the room does not, so that is where the tutor is
      // actually going to start.
      const anyInPerson = (json.students ?? []).some(
        (s: Row) => s.mode !== 'online' && s.seat_type === 'physical'
      );
      setTab(anyInPerson ? 'in_person' : 'online');
    } catch {
      setError('Could not load the register.');
    } finally {
      setLoading(false);
    }
  }, [groupId, occurrenceId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const setMark = (studentId: string, status: Mark) => {
    setSavedAt(null);
    setRows((prev) =>
      prev.map((r) =>
        r.student_id === studentId
          ? { ...r, status, mode: r.mode ?? (tab === 'in_person' ? 'in_person' : 'online') }
          : r
      )
    );
  };

  const setNote = (studentId: string, note: string) => {
    setSavedAt(null);
    setRows((prev) => prev.map((r) => (r.student_id === studentId ? { ...r, note } : r)));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const marks = rows
        .filter((r) => r.status !== null)
        .map((r) => ({
          student_id: r.student_id,
          status: r.status as Mark,
          mode: r.mode ?? 'online',
          note: r.note ?? undefined,
        }));
      const res = await fetch(`/api/groups/${groupId}/occurrences/${occurrenceId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks }),
      });
      if (!res.ok) throw new Error();
      setSavedAt(new Date().toISOString());
    } catch {
      // Said plainly rather than silently retried: the tutor is about to walk
      // out of the room, and needs to know the marks are still on the phone.
      setError('Not saved yet — check your signal and press Save again.');
    } finally {
      setSaving(false);
    }
  };

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        // Evidence first: a join click lands them under Online whatever they
        // bought. Everyone else sits under the half matching their seat.
        const effective: Mode =
          r.mode ?? (r.seat_type === 'physical' ? 'in_person' : 'online');
        return effective === tab;
      }),
    [rows, tab]
  );

  const present = rows.filter((r) => r.status === 'attended' || r.status === 'late').length;
  const inPersonPresent = rows.filter(
    (r) => (r.status === 'attended' || r.status === 'late') && (r.mode ?? (r.seat_type === 'physical' ? 'in_person' : 'online')) === 'in_person'
  ).length;
  const onlinePresent = present - inPersonPresent;
  const unmarked = rows.filter((r) => r.status === null).length;

  if (loading) {
    return (
      <TutorShell>
        <div className="flex items-center justify-center py-20 text-sm text-gray-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading register…
        </div>
      </TutorShell>
    );
  }

  const when = occurrence?.scheduled_start_at
    ? new Date(occurrence.scheduled_start_at).toLocaleString('en-TT', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

  return (
    <TutorShell>
      {/* max-w and no table: a register on a phone must never scroll sideways. */}
      <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-0">
        <Link
          href={`/tutor/classes/${groupId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" /> {groupName || 'Class'}
        </Link>

        <header className="mt-3">
          <h1 className="text-xl font-bold text-gray-900">Attendance</h1>
          <p className="mt-0.5 text-sm text-gray-500">{when}</p>
          {/* The resolved count, per §6 — one line that answers "who is here". */}
          <p className="mt-2 text-sm font-semibold text-gray-900">
            {present} of {rows.length} present
            {present > 0 && (
              <span className="font-normal text-gray-500">
                {' · '}
                {inPersonPresent} in person, {onlinePresent} online
              </span>
            )}
          </p>
        </header>

        <div className="mt-4 inline-flex rounded-xl bg-gray-100 p-1">
          {(['in_person', 'online'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setTab(m)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {m === 'in_person' ? 'In person' : 'Online'}
            </button>
          ))}
        </div>

        <ul className="mt-4 space-y-2">
          {shown.length === 0 ? (
            <li className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              Nobody in this group for this session.
            </li>
          ) : (
            shown.map((r) => {
              // The mismatch worth surfacing: bought a room seat, joined the
              // call. Shown, never corrected — it is a fact about one session.
              const mismatch = r.seat_type === 'physical' && r.mode === 'online';
              const contradicts = r.status === 'absent' && Boolean(r.joined_at);
              return (
                <li key={r.student_id} className="rounded-2xl border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{r.name}</p>
                      {mismatch ? (
                        <p className="text-[12px] text-amber-700">
                          Has an in-person seat · joined online
                        </p>
                      ) : r.joined_at ? (
                        <p className="text-[12px] text-gray-500">Joined the call</p>
                      ) : null}
                    </div>
                  </div>

                  {/* Large targets, three across, thumb-reachable. */}
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    {(['attended', 'late', 'absent'] as Mark[]).map((m) => {
                      const on = r.status === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMark(r.student_id, m)}
                          className={`min-h-[44px] rounded-xl border text-sm font-semibold transition ${
                            on
                              ? m === 'absent'
                                ? 'border-rose-500 bg-rose-50 text-rose-700'
                                : 'border-itutor-green bg-emerald-50 text-emerald-800'
                              : 'border-gray-200 text-gray-600 active:bg-gray-50'
                          }`}
                        >
                          {MARK_LABEL[m]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Only when the mark disagrees with the join log. Captured
                      because overwriting silently would destroy the only
                      evidence the student has if they query it. */}
                  {contradicts ? (
                    <input
                      value={r.note ?? ''}
                      onChange={(e) => setNote(r.student_id, e.target.value)}
                      placeholder="They show as joined — what happened?"
                      maxLength={500}
                      className="mt-2 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-gray-900 placeholder:text-amber-700/60 focus:outline-none"
                    />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>

        {/* Sticky, because the roll can be longer than the screen and the tutor
            should never have to scroll to the bottom to save. */}
        <div className="sticky bottom-0 mt-4 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-2xl">
          {error ? (
            <p className="mb-2 flex items-center gap-1.5 text-sm text-rose-600">
              <WifiOff className="h-4 w-4 shrink-0" /> {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-itutor-green text-base font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedAt ? <Check className="h-4 w-4" /> : null}
            {saving ? 'Saving…' : savedAt ? 'Saved' : 'Save attendance'}
          </button>
          {unmarked > 0 && !savedAt ? (
            <p className="mt-1.5 text-center text-[12px] text-gray-500">
              {unmarked} still unmarked — you can save now and finish later.
            </p>
          ) : null}
        </div>
      </div>
    </TutorShell>
  );
}
