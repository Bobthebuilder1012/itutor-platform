'use client';

// A student's own attendance — §9.2, decision 17.
//
// It existed for their parent and their tutor and not for them, which is the
// wrong way round for the person it describes. This is read-only, like every
// other attendance surface: decision 16 makes it automatic and editable by
// nobody.
//
// THE COPY DOES A JOB
// A student seeing "Absent" against a class they believe they attended will go to
// their tutor and ask for it to be changed. The tutor cannot change it either,
// and neither can support. Saying so plainly — and saying what the record is
// actually derived from, the Join click — turns a dead-end complaint into
// something they can act on next time.
//
// Cancelled and didn't-run sessions are shown rather than hidden, so the count a
// student sees adds up against the classes they remember.

import { useCallback, useEffect, useState } from 'react';
import { Ban, Check, Clock, Loader2, X } from 'lucide-react';

type Row = {
  key: string;
  label: string;
  start: string;
  type: '1:1' | 'group';
  status: 'attended' | 'late' | 'absent' | 'cancelled' | 'excluded';
  lateMinutes: number | null;
};

type Summary = {
  attended: number;
  late: number;
  absent: number;
  cancelled: number;
  excluded: number;
  rate: number | null;
  counted: number;
  rateLabel: string;
};

const STATUS: Record<Row['status'], { label: string; icon: typeof Check; chip: string; text: string }> = {
  attended:  { label: 'Attended',   icon: Check, chip: 'bg-brand/10 text-brand',          text: 'text-brand' },
  late:      { label: 'Late',       icon: Clock, chip: 'bg-amber-100 text-amber-700',     text: 'text-amber-700' },
  absent:    { label: 'Absent',     icon: X,     chip: 'bg-rose-100 text-rose-600',       text: 'text-rose-600' },
  cancelled: { label: 'Cancelled',  icon: Ban,   chip: 'bg-muted text-muted-foreground',  text: 'text-muted-foreground' },
  excluded:  { label: 'Didn’t run', icon: Ban,   chip: 'bg-muted text-muted-foreground',  text: 'text-muted-foreground' },
};

export default function MyAttendance({ groupId }: { groupId?: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/student/attendance${groupId ? `?groupId=${encodeURIComponent(groupId)}` : ''}`,
        { cache: 'no-store' }
      );
      if (!res.ok) return;
      const json = await res.json();
      setRows(json.attendance ?? []);
      setSummary(json.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  // Nothing has happened yet: silence beats an empty grid implying a bad record.
  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-ink">Your attendance</h2>
        <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Automatic · not editable
        </span>
      </div>

      {summary && (
        <>
          {/* §6: the denominator always travels with the figure. */}
          <div className="mt-2 text-2xl font-extrabold tabular-nums text-ink">
            {summary.rateLabel}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span><strong className="text-brand tabular-nums">{summary.attended}</strong> attended</span>
            <span><strong className="text-amber-700 tabular-nums">{summary.late}</strong> late</span>
            <span><strong className="text-rose-600 tabular-nums">{summary.absent}</strong> absent</span>
            {summary.cancelled > 0 && (
              <span><strong className="tabular-nums">{summary.cancelled}</strong> cancelled</span>
            )}
          </div>
          {summary.excluded > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {summary.excluded} class{summary.excluded === 1 ? '' : 'es'} didn&rsquo;t run — those
              count for nobody, so they are not held against you.
            </p>
          )}
        </>
      )}

      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const s = STATUS[r.status] ?? STATUS.absent;
          const Icon = s.icon;
          return (
            <li key={r.key} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${s.chip}`}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{r.label}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.start).toLocaleDateString('en-TT', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'America/Port_of_Spain',
                  })}
                  {' · '}
                  {new Date(r.start).toLocaleTimeString('en-TT', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'America/Port_of_Spain',
                  })}
                </div>
              </div>
              <span className={`shrink-0 text-right text-xs font-bold uppercase tracking-wider ${s.text}`}>
                {s.label}
                {r.status === 'late' && r.lateMinutes ? (
                  <span className="block text-[10px] font-semibold normal-case tracking-normal text-muted-foreground">
                    {r.lateMinutes} min late
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Where the record comes from, and who can change it: nobody. */}
      <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        Recorded automatically when you click Join. Arriving after the class starts counts as late,
        and cancelled classes don&rsquo;t count against you. Nobody can change these records — not
        your tutor, not iTutor support — so if one looks wrong, the thing that fixes it is joining
        on time next session.
      </p>
    </section>
  );
}
