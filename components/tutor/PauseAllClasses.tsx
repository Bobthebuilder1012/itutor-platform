'use client';

// "Pause all classes" for My Classes, plus the persistent paused banner.
//
// TWO STATES, AND THE BANNER IS THE IMPORTANT ONE
// A tutor who paused three weeks ago and forgot needs to see it every time they
// open this page — otherwise they wonder why nobody is enrolling, and the answer
// is that they closed enrolment themselves. So the banner is persistent and names
// the return date rather than being a toast that appears once.
//
// It is not a toggle. A break has a mandatory end date, so "Pause All" opens a
// form and "Resume All" is not a single click either — coming back early needs the
// same notice as going away, per the spec. Per-class control lives in each class's
// Danger zone; this is the "I am going on holiday" shortcut.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Loader2, PauseCircle } from 'lucide-react';

type ClassRow = {
  id: string;
  name: string;
  paused: boolean;
  active: boolean;
  start: string | null;
  end: string | null;
};

type State = {
  classes: ClassRow[];
  anyPaused: boolean;
  pausedCount: number;
  noticeDays: number;
  earliestStart: string;
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-TT', {
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Port_of_Spain',
    });
  } catch {
    return iso;
  }
}

export default function PauseAllClasses() {
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/pause-all', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as State;
      setState(json);
      setStartDate((prev) => prev || json.earliestStart);
    } catch {
      /* nothing renders */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state || state.classes.length === 0) return null;

  const pausedRows = state.classes.filter((r) => r.paused);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tutor/pause-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pauseStart: new Date(`${startDate}T12:00:00Z`).toISOString(),
          pauseEnd: new Date(`${endDate}T12:00:00Z`).toISOString(),
        }),
      });
      const json = await res.json();

      if (!res.ok && res.status !== 207) {
        setError(json.error ?? 'That could not be applied.');
        return;
      }

      // 207 means some classes did not pause. Reported plainly — a tutor who
      // believes everything is on break will not chase the one that is not.
      const parts: string[] = [];
      if (json.applied?.length) parts.push(`${json.applied.length} paused`);
      if (json.skipped?.length) parts.push(`${json.skipped.length} already on a break`);
      if (json.failed?.length) {
        parts.push(
          `${json.failed.length} could not be paused (${json.failed
            .map((f: { name: string }) => f.name)
            .join(', ')})`
        );
      }
      parts.push(`${json.familiesNotified ?? 0} families told`);
      setResult(parts.join(' · '));
      setOpen(false);
      await load();
    } catch {
      setError('That could not be applied.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Persistent, not a toast. */}
      {state.anyPaused && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="min-w-0 text-sm">
            <div className="font-semibold text-amber-900">
              {state.pausedCount === 1
                ? '1 class is on a break'
                : `${state.pausedCount} classes are on a break`}
            </div>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
              {pausedRows.map((r) => (
                <li key={r.id}>
                  <strong>{r.name}</strong> — {r.active ? 'on break' : 'break scheduled'} until{' '}
                  {fmt(r.end)}. New enrolment is closed until then.
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-amber-800">
              Billing restarts on its own when each break ends. Change a break from that
              class&rsquo;s settings, under Danger zone.
            </p>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-ink">
          {result}
        </div>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-muted"
        >
          <PauseCircle className="size-4" />
          Pause all classes
        </button>
      ) : (
        <div className="space-y-2.5 rounded-2xl border border-border bg-background p-4">
          <div>
            <div className="text-sm font-bold text-ink">Pause all classes</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Stops billing across every class you run and shifts each family&rsquo;s renewal date by
              the length of the break. Nobody is refunded and nobody loses a session — the dates
              move, and places are held.
            </p>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
            Families need at least {state.noticeDays} days&rsquo; notice, so the earliest start is{' '}
            {fmt(state.earliestStart)}.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
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
            <label className="block text-xs font-medium text-muted-foreground">
              Break ends
              <input
                type="date"
                value={endDate}
                min={state.earliestStart}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink"
              />
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            A break must have an end date. Every class comes back on that date on its own — you do
            not have to do anything. Classes already on a break are left alone.
          </p>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={submit}
              disabled={busy || !startDate || !endDate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Pause {state.classes.length - state.pausedCount} classes and notify families
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
