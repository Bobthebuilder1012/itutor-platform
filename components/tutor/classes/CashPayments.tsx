'use client';

/**
 * The class Payments screen's CASH tab.
 *
 * Two things, in the order a tutor needs them:
 *
 *   1. Requests — students who asked to join paying cash. Accept puts them in
 *      the class; decline tells them why. Above the ledger because a waiting
 *      student is the only thing on this screen with someone blocked on it.
 *   2. The ledger — cash students × months. The tutor marks each month Paid or
 *      Missed. Bookkeeping only: iTutor never holds this money, and no mark
 *      here removes anyone from the class.
 */

import { useCallback, useEffect, useState } from 'react';
import { Banknote, Check, Loader2, TriangleAlert, UserPlus, X } from 'lucide-react';

type CashCellState = 'paid' | 'missed' | 'open' | 'waived' | 'before';

interface CashCell {
  month: string;
  state: CashCellState;
  id: string | null;
  amount: number | null;
}

interface CashStudent {
  student_id: string;
  name: string;
  seat_type: 'online' | 'physical';
  monthly: number;
  cells: CashCell[];
}

interface Ledger {
  months: string[];
  students: CashStudent[];
  summary: { collected: number; thisMonthOpen: number; missed: number };
}

interface CashRequest {
  id: string;
  student_id: string;
  name: string;
  seat_type: 'online' | 'physical';
  note: string | null;
  amount: number;
  created_at: string;
}

const LOOK: Record<CashCellState, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  missed: { label: 'Missed', className: 'bg-rose-100 text-rose-700 border-rose-200' },
  open: { label: 'Mark', className: 'bg-white text-muted-foreground border-dashed border-border' },
  waived: { label: 'Waived', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  before: { label: '—', className: 'text-muted-foreground' },
};

const ttd = (n: number) => `TTD ${Math.round(n).toLocaleString()}`;

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-TT', { month: 'short', year: '2-digit' });
}

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function CashPayments({ groupId, onRosterChange }: { groupId: string; onRosterChange?: () => void }) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [requests, setRequests] = useState<CashRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openCell, setOpenCell] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [lRes, rRes] = await Promise.all([
        fetch(`/api/groups/${groupId}/cash-ledger`, { cache: 'no-store' }),
        fetch(`/api/groups/${groupId}/cash-requests`, { cache: 'no-store' }),
      ]);
      if (lRes.status === 503) setUnavailable(true);
      else if (lRes.ok) setLedger(await lRes.json());
      else throw new Error();
      if (rRes.ok) setRequests(((await rRes.json()).requests ?? []) as CashRequest[]);
      setError(null);
    } catch {
      setError('Could not load cash payments.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (r: CashRequest, action: 'approve' | 'decline') => {
    let reason: string | undefined;
    if (action === 'decline') {
      const answer = window.prompt(`Decline ${r.name}? Add a short reason (optional) — they will see it.`);
      if (answer === null) return;
      reason = answer;
    }
    setBusy(r.id);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/cash-requests/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server's sentence: "your in-person seats are full" is something
        // to act on, not retry past.
        setError(json?.error || 'That did not save.');
        return;
      }
      await load();
      if (action === 'approve') onRosterChange?.();
    } catch {
      setError('That did not save — check your connection.');
    } finally {
      setBusy(null);
    }
  };

  const mark = async (s: CashStudent, month: string, value: 'paid' | 'missed' | 'clear') => {
    const key = `${s.student_id}:${month}`;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/cash-ledger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: s.student_id, month, mark: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || 'That did not save.');
        return;
      }
      setOpenCell(null);
      await load();
    } catch {
      setError('That did not save — check your connection.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading cash payments…
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Cash payments are not available yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Cash payments</h2>
          <p className="text-xs text-muted-foreground">
            Paid to you in person. Mark each month so you know who is up to date.
          </p>
        </div>
        {ledger && ledger.students.length > 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm">
            <span className="font-bold text-emerald-700">Collected {ttd(ledger.summary.collected)}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className={ledger.summary.thisMonthOpen > 0 ? 'font-bold text-amber-700' : 'text-muted-foreground'}>
              {ledger.summary.thisMonthOpen} unmarked this month
            </span>
            {ledger.summary.missed > 0 ? (
              <>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="font-bold text-rose-700">{ledger.summary.missed} missed</span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
        </p>
      ) : null}

      {requests.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
            <UserPlus className="h-4 w-4" />
            {requests.length} {requests.length === 1 ? 'student wants' : 'students want'} to join paying cash
          </h3>
          <p className="mt-0.5 text-xs text-amber-800">
            They are not in the class until you accept. Accepting takes a seat.
          </p>
          <ul className="mt-3 space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {r.seat_type === 'physical' ? 'In-person seat' : 'Online seat'} · {ttd(r.amount)} / month · asked{' '}
                    {ago(r.created_at)}
                  </p>
                  {r.note ? <p className="mt-1 text-[12px] italic text-ink">&ldquo;{r.note}&rdquo;</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => decide(r, 'approve')}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-60"
                  >
                    {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => decide(r, 'decline')}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-muted-foreground transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" /> Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!ledger || ledger.students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <Banknote className="mx-auto mb-2 h-5 w-5" />
          No students pay this class in cash yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="sticky left-0 bg-muted/40 px-4 py-2 text-left font-bold">Student</th>
                {ledger.months.map((m) => (
                  <th key={m} className="px-3 py-2 text-center font-bold">
                    {monthLabel(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledger.students.map((s) => (
                <tr key={s.student_id}>
                  <td className="sticky left-0 bg-card px-4 py-3">
                    <p className="truncate font-semibold text-ink">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.seat_type === 'physical' ? 'In person' : 'Online'} · {ttd(s.monthly)}/mo
                    </p>
                  </td>
                  {s.cells.map((c) => {
                    const key = `${s.student_id}:${c.month}`;
                    const look = LOOK[c.state];
                    if (c.state === 'before' || c.state === 'waived') {
                      return (
                        <td key={c.month} className="px-2 py-2 text-center">
                          {c.state === 'before' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${look.className}`}>
                              {look.label}
                            </span>
                          )}
                        </td>
                      );
                    }
                    return (
                      <td key={c.month} className="relative px-2 py-2 text-center">
                        <button
                          type="button"
                          disabled={busy === key}
                          onClick={() => setOpenCell(openCell === key ? null : key)}
                          className={`inline-flex min-w-[64px] items-center justify-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${look.className}`}
                        >
                          {busy === key ? <Loader2 className="h-3 w-3 animate-spin" /> : look.label}
                        </button>
                        {openCell === key ? (
                          <div className="absolute left-1/2 z-20 mt-1 w-40 -translate-x-1/2 rounded-xl border border-border bg-white p-1.5 text-left shadow-lg">
                            {c.state !== 'paid' ? (
                              <button
                                type="button"
                                onClick={() => mark(s, c.month, 'paid')}
                                className="block w-full rounded-lg px-2.5 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                              >
                                Mark paid
                              </button>
                            ) : null}
                            {c.state !== 'missed' ? (
                              <button
                                type="button"
                                onClick={() => mark(s, c.month, 'missed')}
                                className="block w-full rounded-lg px-2.5 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                              >
                                Mark missed
                              </button>
                            ) : null}
                            {c.state !== 'open' ? (
                              <button
                                type="button"
                                onClick={() => mark(s, c.month, 'clear')}
                                className="block w-full rounded-lg px-2.5 py-2 text-sm font-medium text-ink hover:bg-muted/60"
                              >
                                Clear
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
