'use client';

/**
 * The class Payments grid. §7.
 *
 * REPLACES A MOCK. What stood here derived each cell from
 * `(members.indexOf(m) * 7 + pi * 3) % 11` — a tutor was being shown invented
 * "Paid" and "Waived" chips against real students' names. That is worse than an
 * empty screen, so nothing about the old shape is preserved for continuity.
 *
 * ── HELD SEATS SIT ABOVE THE GRID ──────────────────────────────────────────
 * An unpaid cash hold occupies a scarce physical seat. As one purple cell in a
 * wall of cells it would be missed, and the cost of missing it is a room that
 * looks full while nobody has paid. So they are their own block, at the top,
 * with the two actions that settle them.
 *
 * ── THE GRID SCROLLS, THE NAME COLUMN DOES NOT ─────────────────────────────
 * Six months of columns will not fit a phone. The student column is sticky, so
 * a tutor scrolling to March never loses track of whose row they are reading —
 * which is the one way a payment grid can cause real harm.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Check,
  CreditCard,
  Loader2,
  MoreHorizontal,
  TriangleAlert,
} from 'lucide-react';

type CellState = 'paid' | 'paid_late' | 'due' | 'overdue' | 'waived' | 'void' | 'not_enrolled';

interface Cell {
  month: string;
  state: CellState;
  amount: number | null;
  method: 'card' | 'cash' | null;
  id: string | null;
}

interface StudentRow {
  student_id: string;
  name: string;
  avatar_url: string | null;
  seat_type: 'online' | 'physical';
  enrolment_status: string | null;
  attendance: { present: number; total: number };
  cells: Cell[];
}

interface HeldSeat {
  enrollment_id: string;
  payment_id: string;
  student_id: string;
  name: string;
  seat_type: 'online' | 'physical';
  amount: number;
  days_held: number;
}

interface GridData {
  months: string[];
  students: StudentRow[];
  heldSeats: HeldSeat[];
  summary: {
    collected: { card: number; cash: number };
    outstanding: { card: number; cash: number };
    graceDays: number;
  } | null;
}

/** One vocabulary for the chips, so the legend and the cells cannot drift. */
const CELL_LOOK: Record<CellState, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  paid_late: { label: 'Late', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  due: { label: 'Due', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  overdue: { label: 'Overdue', className: 'bg-rose-100 text-rose-700 border-rose-200' },
  waived: { label: 'Waived', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  void: { label: 'Void', className: 'bg-slate-100 text-slate-400 border-slate-200 line-through' },
  not_enrolled: { label: '—', className: 'text-muted-foreground' },
};

function ttd(n: number): string {
  return `TTD ${Math.round(n).toLocaleString()}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-TT', {
    month: 'short',
    year: '2-digit',
  });
}

export default function PaymentsGrid({ groupId }: { groupId: string }) {
  const [data, setData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openCell, setOpenCell] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/payments`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(null);
    } catch {
      setError('Could not load payments.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (
    paymentId: string,
    action: 'record_cash' | 'waive' | 'void',
    reason?: string
  ) => {
    setBusyId(paymentId);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server's sentence, not a generic one: the refusals here ("only
        // cash can be recorded by hand", "already recorded") are both things
        // the tutor needs to read rather than retry past.
        setError(json?.error || 'That did not save.');
        return;
      }
      setOpenCell(null);
      await load();
    } catch {
      setError('That did not save — check your connection.');
    } finally {
      setBusyId(null);
    }
  };

  const totals = useMemo(() => {
    if (!data?.summary) return null;
    const { collected, outstanding } = data.summary;
    return {
      collected: collected.card + collected.cash,
      outstanding: outstanding.card + outstanding.cash,
      cashCollected: collected.cash,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading payments…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {error ?? 'Could not load payments.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Payments</h2>
          <p className="text-xs text-muted-foreground">
            Every student × month. Grace period {data.summary?.graceDays ?? 7} days.
          </p>
        </div>
        {totals ? (
          <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm">
            <span className="font-bold text-emerald-700">Collected {ttd(totals.collected)}</span>
            {totals.cashCollected > 0 ? (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({ttd(totals.cashCollected)} cash)
              </span>
            ) : null}
            <span className="mx-2 text-muted-foreground">vs</span>
            <span
              className={
                totals.outstanding > 0
                  ? 'font-bold text-rose-700'
                  : 'font-bold text-muted-foreground'
              }
            >
              Outstanding {ttd(totals.outstanding)}
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
        </p>
      ) : null}

      {/* Held seats — above the grid, deliberately. See the header. */}
      {data.heldSeats.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
            <Banknote className="h-4 w-4" />
            {data.heldSeats.length} seat{data.heldSeats.length === 1 ? '' : 's'} held for cash
          </h3>
          <p className="mt-0.5 text-xs text-amber-800">
            These places are taken but not paid for. Record the cash when you receive it, or
            release the seat.
          </p>
          <ul className="mt-3 space-y-2">
            {data.heldSeats.map((h) => (
              <li
                key={h.enrollment_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{h.name}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {h.seat_type === 'physical' ? 'In-person seat' : 'Online seat'} ·{' '}
                    {ttd(h.amount)} · held{' '}
                    {h.days_held === 0
                      ? 'today'
                      : `${h.days_held} day${h.days_held === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === h.payment_id}
                    onClick={() => act(h.payment_id, 'record_cash')}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-60"
                  >
                    {busyId === h.payment_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Cash received
                  </button>
                  <button
                    type="button"
                    disabled={busyId === h.payment_id}
                    onClick={() => {
                      // Confirmed, because it takes the seat back off someone
                      // who believes they have a place in the class.
                      if (!window.confirm(`Release ${h.name}'s seat? They will lose their place.`))
                        return;
                      void act(h.payment_id, 'void', 'Seat released — cash never received');
                    }}
                    className="min-h-[38px] rounded-lg border border-border px-3 text-sm font-semibold text-muted-foreground transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-60"
                  >
                    Release
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nobody has joined this class yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="sticky left-0 bg-muted/40 px-4 py-2 text-left font-bold">Student</th>
                {data.months.map((m) => (
                  <th key={m} className="px-3 py-2 text-center font-bold">
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-bold">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.students.map((s) => (
                <tr key={s.student_id}>
                  <td className="sticky left-0 bg-card px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-emerald-400 text-[10px] font-bold text-white">
                        {s.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {s.seat_type === 'physical' ? 'In person' : 'Online'}
                        </p>
                      </div>
                    </div>
                  </td>

                  {s.cells.map((c) => {
                    const look = CELL_LOOK[c.state];
                    const key = `${s.student_id}:${c.month}`;
                    const actionable = Boolean(c.id) && c.state !== 'void' && c.state !== 'waived';
                    return (
                      <td key={c.month} className="relative px-2 py-2 text-center">
                        {c.state === 'not_enrolled' ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <button
                            type="button"
                            disabled={!actionable}
                            onClick={() => setOpenCell(openCell === key ? null : key)}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${look.className} ${
                              actionable ? 'cursor-pointer' : 'cursor-default'
                            }`}
                            title={c.amount ? ttd(c.amount) : undefined}
                          >
                            {c.method === 'cash' ? (
                              <Banknote className="h-3 w-3" />
                            ) : c.method === 'card' ? (
                              <CreditCard className="h-3 w-3" />
                            ) : null}
                            {look.label}
                            {actionable ? <MoreHorizontal className="h-3 w-3 opacity-50" /> : null}
                          </button>
                        )}

                        {openCell === key && c.id ? (
                          <div className="absolute left-1/2 z-20 mt-1 w-48 -translate-x-1/2 rounded-xl border border-border bg-white p-1.5 text-left shadow-lg">
                            {c.state !== 'paid' && c.state !== 'paid_late' && c.method === 'cash' ? (
                              <button
                                type="button"
                                disabled={busyId === c.id}
                                onClick={() => act(c.id as string, 'record_cash')}
                                className="block w-full rounded-lg px-2.5 py-2 text-sm font-medium text-ink hover:bg-muted/60"
                              >
                                Cash received
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={busyId === c.id}
                              onClick={() => {
                                const reason = window.prompt('Why is this month waived?');
                                if (reason === null) return;
                                void act(c.id as string, 'waive', reason);
                              }}
                              className="block w-full rounded-lg px-2.5 py-2 text-sm font-medium text-ink hover:bg-muted/60"
                            >
                              Waive this month
                            </button>
                            <button
                              type="button"
                              disabled={busyId === c.id}
                              onClick={() => {
                                const reason = window.prompt('Why are you voiding this charge?');
                                if (reason === null) return;
                                void act(c.id as string, 'void', reason);
                              }}
                              className="block w-full rounded-lg px-2.5 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                            >
                              Void charge
                            </button>
                          </div>
                        ) : null}
                      </td>
                    );
                  })}

                  <td className="px-4 py-3 text-right text-sm tabular-nums">
                    {s.attendance.total === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="font-semibold text-ink">
                        {s.attendance.present}/{s.attendance.total}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The legend. Six states in a wall of chips is exactly where a tutor
          guesses wrong. "Late" and "Paid" are both green on purpose — the money
          arrived either way, and the distinction is history, not a debt. */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        {(['paid', 'paid_late', 'due', 'overdue', 'waived', 'void'] as CellState[]).map((s) => (
          <span
            key={s}
            className={`rounded-md border px-2 py-1 font-bold uppercase tracking-wider ${CELL_LOOK[s].className}`}
          >
            {CELL_LOOK[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}
