'use client';

// Per-class pause control, for the class settings Danger zone.
//
// It sits in the Danger zone because of who it affects, not because it is
// destructive: pausing is fully reversible, but it stops billing and shifts the
// renewal date for EVERY enrolled family at once. That is the same category of
// consequence as deleting the class, and it belongs behind the same deliberate
// click. The copy says so plainly, because the section header promises
// irreversible actions and this one is not — a tutor who reads "irreversible"
// and assumes they cannot undo a pause will avoid a feature built for them.
//
// The form refuses an impossible date before the tutor commits rather than after:
// the earliest legal start comes from the server, so the 7-day notice rule is not
// duplicated here and cannot drift from it.

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, PauseCircle, PlayCircle } from 'lucide-react';

type PauseState = {
  className: string | null;
  familyCount: number;
  noticeDays: number;
  earliestStart: string;
  enrolmentClosedUntil: string | null;
  pause: {
    scheduled: boolean;
    active: boolean;
    start: string | null;
    end: string | null;
    adjustedRenewal: string | null;
  };
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-TT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Port_of_Spain',
    });
  } catch {
    return iso;
  }
}

export default function ClassPausePanel({ classId }: { classId: string }) {
  const [state, setState] = useState<PauseState | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'pause' | 'extend' | 'resume-early'>('pause');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tutor/classes/${classId}/pause`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as PauseState;
      setState(json);
      if (!startDate) setStartDate(json.earliestStart);
    } catch {
      /* the panel simply does not render */
    }
  }, [classId, startDate]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  if (!state) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === 'pause'
          ? { action: 'pause', pauseStart: toIso(startDate), pauseEnd: toIso(endDate) }
          : mode === 'extend'
            ? { action: 'extend', newPauseEnd: toIso(endDate) }
            : { action: 'resume-early', newResumeAt: toIso(endDate) };

      const res = await fetch(`/api/tutor/classes/${classId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.message ?? json.error ?? 'That could not be applied.');
        return;
      }

      setNotice(
        `${json.familiesNotified ?? 0} of ${json.familiesAffected ?? 0} ${
          (json.familiesAffected ?? 0) === 1 ? 'family has' : 'families have'
        } been told.`
      );
      setOpen(false);
      await load();
    } catch {
      setError('That could not be applied.');
    } finally {
      setBusy(false);
    }
  };

  const p = state.pause;

  return (
    <div className="w-full rounded-xl border border-rose-200 bg-background px-4 py-3">
      <div className="flex items-start gap-3">
        {p.scheduled ? (
          <PlayCircle className="size-4 mt-0.5 text-rose-600" />
        ) : (
          <PauseCircle className="size-4 mt-0.5 text-rose-600" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-rose-700">
            {p.scheduled ? 'Class break' : 'Pause this class'}
          </div>

          {p.scheduled ? (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {p.active ? 'On break' : 'Break scheduled'} from{' '}
              <strong className="text-ink">{fmt(p.start)}</strong> until{' '}
              <strong className="text-ink">{fmt(p.end)}</strong>.
              {p.adjustedRenewal && (
                <>
                  {' '}
                  Renewal moved to <strong className="text-ink">{fmt(p.adjustedRenewal)}</strong>.
                </>
              )}
              {' '}Places are held and new enrolment is closed until it ends.
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Stops billing for {state.familyCount}{' '}
              {state.familyCount === 1 ? 'family' : 'families'} and shifts each renewal date by the
              length of the break. Nobody is refunded and nobody loses a session — the dates move.
              Places are held. <strong className="text-ink">This is reversible.</strong>
            </div>
          )}

          {notice && <div className="mt-1.5 text-xs text-brand">{notice}</div>}

          {!open && (
            <div className="mt-2 flex flex-wrap gap-2">
              {p.scheduled ? (
                <>
                  <button
                    onClick={() => {
                      setMode('extend');
                      setEndDate('');
                      setOpen(true);
                    }}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Extend the break
                  </button>
                  <button
                    onClick={() => {
                      setMode('resume-early');
                      setEndDate('');
                      setOpen(true);
                    }}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:bg-muted"
                  >
                    Come back sooner
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setMode('pause');
                    setOpen(true);
                  }}
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Schedule a break
                </button>
              )}
            </div>
          )}

          {open && (
            <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              {/* Every action needs the same notice, including coming back
                  sooner — a family charged ahead of schedule has a legitimate
                  grievance. */}
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
                Families need at least {state.noticeDays} days&rsquo; notice, so the earliest date
                you can choose is {fmt(state.earliestStart)}.
              </p>

              {mode === 'pause' && (
                <label className="block text-xs font-medium text-muted-foreground">
                  Break starts
                  <input
                    type="date"
                    value={startDate}
                    min={state.earliestStart}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink"
                  />
                </label>
              )}

              <label className="block text-xs font-medium text-muted-foreground">
                {mode === 'resume-early' ? 'Comes back on' : 'Break ends'}
                <input
                  type="date"
                  value={endDate}
                  min={state.earliestStart}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink"
                />
              </label>

              {/* An end date is mandatory — a break with no end never
                  auto-resumes, which is the one shape that could leave a class
                  paused indefinitely. */}
              <p className="text-xs text-muted-foreground">
                {mode === 'resume-early'
                  ? 'Families will be told the class is coming back earlier, and when billing restarts.'
                  : 'A break must have an end date. Billing restarts on that date on its own — you do not have to do anything.'}
              </p>

              {error && <p className="text-xs text-rose-600">{error}</p>}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={submit}
                  disabled={busy || !endDate || (mode === 'pause' && !startDate)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {busy && <Loader2 className="size-3.5 animate-spin" />}
                  {mode === 'pause'
                    ? `Pause and notify ${state.familyCount} ${
                        state.familyCount === 1 ? 'family' : 'families'
                      }`
                    : mode === 'extend'
                      ? 'Extend and notify'
                      : 'Confirm and notify'}
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                  className="rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Midday UTC, so a date picked in Trinidad does not land on the previous day. */
function toIso(date: string): string {
  return new Date(`${date}T12:00:00Z`).toISOString();
}
