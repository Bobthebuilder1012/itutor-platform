'use client';

// Teacher Payouts — lesson (group class) earnings grouped by tutor.
//
// Each tutor is paid once a month on their own payout day (the day of their
// first lesson payment). Finance ticks the tutors to pay, generates the bank
// CSV, makes the transfer, then confirms the batch. Generating never marks
// anyone paid; only "Confirm payout" does, and that moves each tutor to their
// next payout date. Rules: lib/payouts/payoutCycle.ts + migration 266.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import DashboardLayout from '@/components/DashboardLayout';
import {
  AlertTriangle, CheckCircle, CheckSquare, ChevronDown, ChevronRight,
  Download, Loader2, RefreshCcw, Square, X,
} from 'lucide-react';
import type {
  LessonRowState, OpenLessonBatch, TeacherPayoutSummary,
} from '@/lib/payouts/teacherPayouts';
import type { PayoutUrgency } from '@/lib/payouts/payoutCycle';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number | null | undefined, currency: 'TTD' | 'USD' = 'TTD') {
  if (n == null) return '—';
  const prefix = currency === 'USD' ? 'US$' : 'TT$';
  return `${prefix} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Payout dates are calendar dates ('YYYY-MM-DD'); format them without a time
// zone so they never shift by a day.
function fmtDay(date: string | null | undefined) {
  if (!date) return '—';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-TT', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function fmtInstant(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TT', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Port_of_Spain',
  });
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function relativeDays(days: number | null) {
  if (days == null) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 0) return `in ${days} days`;
  return days === -1 ? '1 day overdue' : `${-days} days overdue`;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const URGENCY: Record<PayoutUrgency, { label: string; chip: string; dot: string }> = {
  overdue:      { label: 'Overdue',      chip: 'bg-rose-100 text-rose-700',       dot: 'bg-rose-500' },
  due_soon:     { label: 'Due soon',     chip: 'bg-amber-100 text-amber-800',     dot: 'bg-amber-400' },
  not_due:      { label: 'Not due',      chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  nothing_owed: { label: 'Nothing owed', chip: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-300' },
};

const ROW_STATE: Record<LessonRowState, { label: string; chip: string }> = {
  owed:           { label: 'Owed',               chip: 'bg-sky-100 text-sky-700' },
  refund_pending: { label: 'Refund requested',   chip: 'bg-rose-100 text-rose-700' },
  secured:        { label: 'Secured spot',       chip: 'bg-gray-100 text-gray-600' },
  held:           { label: 'On hold',            chip: 'bg-amber-100 text-amber-800' },
  in_batch:       { label: 'In CSV, unconfirmed', chip: 'bg-purple-100 text-purple-700' },
  paid:           { label: 'Paid',               chip: 'bg-emerald-100 text-emerald-700' },
  reversed:       { label: 'Reversed',           chip: 'bg-gray-100 text-gray-400' },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherPayoutsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [tutors, setTutors] = useState<TeacherPayoutSummary[]>([]);
  const [openBatches, setOpenBatches] = useState<OpenLessonBatch[]>([]);
  const [today, setToday] = useState('');
  const [dueSoonDays, setDueSoonDays] = useState(7);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showPaid, setShowPaid] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [batchBusy, setBatchBusy] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin') { router.push('/login'); return; }
      if (isEmailManagementOnlyAdmin(profile.email)) { router.replace('/admin/emails'); return; }
      setAuthLoading(false);
    })();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/tutor-payouts');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setTutors(data.tutors ?? []);
      setOpenBatches(data.open_batches ?? []);
      setToday(data.today ?? '');
      setDueSoonDays(data.due_soon_days ?? 7);
      setSelected(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

  const payable = useMemo(() => tutors.filter((t) => t.owed_count > 0), [tutors]);
  const selectedTutors = tutors.filter((t) => selected.has(t.tutor_id));
  const counts = useMemo(() => ({
    overdue: tutors.filter((t) => t.urgency === 'overdue').length,
    due_soon: tutors.filter((t) => t.urgency === 'due_soon').length,
    owedTotal: Math.round(tutors.reduce((s, t) => s + t.owed_ttd, 0) * 100) / 100,
    flagged: tutors.reduce((s, t) => s + t.refund_pending_count, 0),
  }), [tutors]);

  function toggle(set: Set<string>, id: string) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  }
  function selectDue() {
    setSelected(new Set(payable.filter((t) => t.urgency === 'overdue' || t.urgency === 'due_soon').map((t) => t.tutor_id)));
  }
  function toggleAll() {
    setSelected(selected.size === payable.length ? new Set() : new Set(payable.map((t) => t.tutor_id)));
  }

  async function generate() {
    setGenerating(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/tutor-payouts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutor_ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'CSV generation failed');
      for (const f of data.files ?? []) downloadCsv(f.csv, f.filename);
      const parts = [`${(data.files ?? []).length} CSV file(s) downloaded. Nobody has been marked paid — confirm each batch below once the bank transfer is done.`];
      for (const s of data.skipped ?? []) parts.push(`Skipped ${s.name}: ${s.reason}.`);
      for (const e of data.errors ?? []) parts.push(`Not generated — ${e}`);
      setNotice(parts.join(' '));
      setConfirmOpen(false);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function redownload(b: OpenLessonBatch) {
    setBatchBusy((p) => ({ ...p, [b.batch_id]: 'download' }));
    try {
      const res = await fetch(`/api/admin/payouts/${b.batch_id}/download`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Download failed');
      if (d.csv) downloadCsv(d.csv, d.filename ?? b.csv_filename ?? `itutor-lesson-payouts-${b.batch_id.slice(0, 8)}.csv`);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBatchBusy((p) => { const n = { ...p }; delete n[b.batch_id]; return n; });
    }
  }

  async function confirmPaid(b: OpenLessonBatch) {
    const amount = b.currency === 'USD' ? fmtMoney(b.total_amount_usd, 'USD') : fmtMoney(b.total_amount_ttd);
    if (!confirm(
      `Confirm that ${amount} was transferred to ${b.tutor_names.join(', ')}?\n\n` +
      'This marks their payments paid and moves each tutor to their next payout date. It cannot be undone.'
    )) return;
    setBatchBusy((p) => ({ ...p, [b.batch_id]: 'paid' }));
    try {
      const res = await fetch(`/api/admin/payouts/${b.batch_id}/mark-paid`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Confirm failed');
      setNotice(`Batch ${b.batch_id.slice(0, 8)} confirmed paid.`);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBatchBusy((p) => { const n = { ...p }; delete n[b.batch_id]; return n; });
    }
  }

  async function cancelBatch(b: OpenLessonBatch) {
    if (!confirm('Cancel this batch? Its payments go back to owed and can be included in a new CSV.')) return;
    setBatchBusy((p) => ({ ...p, [b.batch_id]: 'cancel' }));
    try {
      const res = await fetch(`/api/admin/payouts/${b.batch_id}/cancel`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Cancel failed');
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBatchBusy((p) => { const n = { ...p }; delete n[b.batch_id]; return n; });
    }
  }

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <AdminBreadcrumb items={[{ label: 'Finance', href: '/admin/payments' }, { label: 'Teacher Payouts' }]} />

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Teacher Payouts</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Group class earnings by tutor. Each tutor is paid once a month on the day of their first lesson payment.
              One-on-one sessions are on <Link href="/admin/payouts" className="text-emerald-700 hover:underline">Payouts</Link>.
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="shrink-0 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-100 text-sm flex items-center gap-1.5"
          >
            <RefreshCcw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{error}</div>}
        {notice && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-start justify-between gap-3">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} className="text-emerald-700"><X className="size-4" /></button>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Summary label="Owed now" value={fmtMoney(counts.owedTotal)} sub={`${payable.length} tutor(s)`} />
          <Summary label="Overdue" value={String(counts.overdue)} sub="Payout date passed" tone="rose" />
          <Summary label="Due soon" value={String(counts.due_soon)} sub={`Within ${dueSoonDays} days`} tone="amber" />
          <Summary label="Refund requests" value={String(counts.flagged)} sub="Held out of CSVs" tone={counts.flagged > 0 ? 'rose' : undefined} />
        </div>

        {/* Batches awaiting confirmation */}
        {openBatches.length > 0 && (
          <section className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Awaiting confirmation</h2>
              <p className="text-xs text-gray-500">
                These CSVs have been generated but nobody in them is marked paid yet. Confirm once the bank transfer has gone through.
              </p>
            </div>
            <div className="space-y-2">
              {openBatches.map((b) => {
                const busy = batchBusy[b.batch_id];
                return (
                  <div key={b.batch_id} className="rounded-lg border border-gray-200 bg-white p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {b.currency === 'USD' ? fmtMoney(b.total_amount_usd, 'USD') : fmtMoney(b.total_amount_ttd)}
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          {b.currency} · {b.line_count} tutor(s) · generated {fmtInstant(b.generated_at)} · {b.batch_id.slice(0, 8)}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 truncate">{b.tutor_names.join(', ')}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => redownload(b)}
                        disabled={!!busy}
                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {busy === 'download' ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                        CSV
                      </button>
                      <button
                        onClick={() => cancelBatch(b)}
                        disabled={!!busy}
                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => confirmPaid(b)}
                        disabled={!!busy || !b.csv_available}
                        title={b.csv_available ? '' : 'Download the CSV first'}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {busy === 'paid' ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle className="size-3.5" />}
                        Confirm payout / Mark as paid
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <button onClick={toggleAll} disabled={payable.length === 0} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              {selected.size > 0 && selected.size === payable.length
                ? <CheckSquare className="size-4 text-emerald-600" />
                : <Square className="size-4" />}
              Select all
            </button>
            <button onClick={selectDue} className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline">
              Select overdue + due soon
            </button>
            {selected.size > 0 && <span className="text-gray-400">{selected.size} selected</span>}
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={selected.size === 0}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-40"
          >
            <Download className="size-4" /> Generate CSV{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>

        {/* Tutors */}
        {loading && tutors.length === 0 ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="size-5 animate-spin" /><span className="text-sm">Loading…</span>
          </div>
        ) : tutors.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-gray-400 gap-2">
            <AlertTriangle className="size-10" />
            <p className="text-sm">No tutors have lesson earnings yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-x-auto bg-white">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-3 py-3 w-8" />
                  <th className="px-3 py-3 text-left">Tutor</th>
                  <th className="px-3 py-3 text-right">Total earned</th>
                  <th className="px-3 py-3 text-right">Owed now</th>
                  <th className="px-3 py-3 text-left">Next payout</th>
                  <th className="px-3 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tutors.map((t) => {
                  const isOpen = expanded.has(t.tutor_id);
                  const isSel = selected.has(t.tutor_id);
                  const canSelect = t.owed_count > 0;
                  const u = URGENCY[t.urgency];
                  return (
                    <Fragment key={t.tutor_id}>
                      <tr
                        className={`cursor-pointer ${isSel ? 'bg-emerald-50/60' : 'hover:bg-gray-50'}`}
                        onClick={() => setExpanded((s) => toggle(s, t.tutor_id))}
                      >
                        <td className="px-3 py-3" onClick={(e) => { e.stopPropagation(); if (canSelect) setSelected((s) => toggle(s, t.tutor_id)); }}>
                          {canSelect
                            ? (isSel ? <CheckSquare className="size-4 text-emerald-600" /> : <Square className="size-4 text-gray-300 hover:text-gray-500" />)
                            : <Square className="size-4 text-gray-100" />}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-start gap-2">
                            {isOpen ? <ChevronDown className="size-4 text-gray-400 mt-0.5" /> : <ChevronRight className="size-4 text-gray-400 mt-0.5" />}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                              <p className="text-xs text-gray-500">
                                {t.has_bank_details
                                  ? <>{t.bank_name ?? 'Bank'} {t.account_masked}</>
                                  : <span className="text-rose-600">No bank details on file</span>}
                                {t.payout_currency === 'USD' && <span className="ml-1.5 px-1.5 rounded bg-sky-100 text-sky-700 text-[10px] font-bold">USD</span>}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-sm text-gray-700 tabular-nums">{fmtMoney(t.total_earned_ttd)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <p className="text-sm font-semibold text-gray-900">{fmtMoney(t.owed_ttd)}</p>
                          {t.owed_usd != null && <p className="text-xs text-sky-700">{fmtMoney(t.owed_usd, 'USD')}</p>}
                          {t.refund_pending_count > 0 && (
                            <p className="text-[11px] text-rose-600">+{fmtMoney(t.refund_pending_ttd)} refund requested</p>
                          )}
                          {t.in_batch_ttd > 0 && (
                            <p className="text-[11px] text-purple-700">{fmtMoney(t.in_batch_ttd)} in unconfirmed CSV</p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-sm text-gray-900">{fmtDay(t.next_payout_on)}</p>
                          <p className="text-xs text-gray-500">
                            {t.next_payout_on ? relativeDays(t.days_until_payout) : 'No schedule yet'}
                            {t.payout_day ? ` · the ${ordinal(t.payout_day)}` : ''}
                          </p>
                          {t.paid_early && t.last_paid_cycle_on && (
                            <p className="text-[11px] text-emerald-700">{fmtDay(t.last_paid_cycle_on)} paid early on {fmtInstant(t.last_paid_at)}</p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${u.chip}`}>
                            <span className={`size-1.5 rounded-full ${u.dot}`} />
                            {u.label}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td />
                          <td colSpan={5} className="px-3 pb-4 pt-1">
                            <Breakdown
                              tutor={t}
                              showPaid={showPaid.has(t.tutor_id)}
                              onTogglePaid={() => setShowPaid((s) => toggle(s, t.tutor_id))}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {today && (
          <p className="text-xs text-gray-400">
            Dates are Port of Spain time (today {fmtDay(today)}). Yellow = due within {dueSoonDays} days. If a tutor&apos;s payout day doesn&apos;t
            exist in a month, that month&apos;s payout falls on its last day.
          </p>
        )}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => !generating && setConfirmOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-900">Generate payout CSV</h2>
              <button onClick={() => setConfirmOpen(false)} className="text-gray-500 hover:text-gray-900"><X className="size-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
                {selectedTutors.map((t) => (
                  <div key={t.tutor_id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="text-gray-900 truncate">{t.name}</p>
                      <p className="text-xs text-gray-500">
                        {t.owed_count} payment(s) · {URGENCY[t.urgency].label}
                        {!t.has_bank_details && <span className="text-rose-600"> · no bank details — will be skipped</span>}
                        {t.pending_deductions_ttd > 0 && <span className="text-amber-700"> · {fmtMoney(t.pending_deductions_ttd)} deduction applies</span>}
                      </p>
                    </div>
                    <span className="tabular-nums font-semibold text-gray-900 ml-3">
                      {t.owed_usd != null ? fmtMoney(t.owed_usd, 'USD') : fmtMoney(t.owed_ttd)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span className="text-gray-700">Total owed (TTD value)</span>
                <span className="tabular-nums">{fmtMoney(selectedTutors.reduce((s, t) => s + t.owed_ttd, 0))}</span>
              </div>
              <p className="text-xs text-gray-500">
                One line per tutor. TTD and USD tutors go in separate files. Generating does <strong>not</strong> mark anyone
                paid — you&apos;ll confirm the batch after the bank transfer.
              </p>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-200">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={generating}
                className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {generating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {generating ? 'Generating…' : 'Generate & download'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Summary({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'rose' | 'amber' }) {
  const color = tone === 'rose' ? 'text-rose-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900';
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
    </div>
  );
}

function Breakdown({ tutor, showPaid, onTogglePaid }: {
  tutor: TeacherPayoutSummary;
  showPaid: boolean;
  onTogglePaid: () => void;
}) {
  const owed = tutor.rows.filter((r) => r.state === 'owed');
  const other = tutor.rows.filter((r) => r.state !== 'owed' && (showPaid || (r.state !== 'paid' && r.state !== 'reversed')));
  const paidCount = tutor.rows.filter((r) => r.state === 'paid' || r.state === 'reversed').length;

  const table = (rows: typeof tutor.rows) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          <th className="py-1.5 pr-3 text-left">Student</th>
          <th className="py-1.5 pr-3 text-left">Class</th>
          <th className="py-1.5 pr-3 text-left">Received</th>
          <th className="py-1.5 pr-3 text-right">Student paid</th>
          <th className="py-1.5 pr-3 text-right">Tutor amount</th>
          <th className="py-1.5 text-left">State</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r) => (
          <tr key={r.ledger_id}>
            <td className="py-1.5 pr-3 text-gray-900">{r.student_name ?? '—'}</td>
            <td className="py-1.5 pr-3 text-gray-700">{r.class_name ?? '—'}</td>
            <td className="py-1.5 pr-3 text-gray-500 text-xs">{fmtInstant(r.received_at)}</td>
            <td className="py-1.5 pr-3 text-right text-gray-500 tabular-nums">{fmtMoney(r.student_paid_ttd)}</td>
            <td className="py-1.5 pr-3 text-right tabular-nums text-gray-900">
              {fmtMoney(r.amount_ttd)}
              {r.payout_currency === 'USD' && (
                <span className="block text-[11px] text-sky-700">{r.amount_usd != null ? fmtMoney(r.amount_usd, 'USD') : 'USD — rate pending'}</span>
              )}
            </td>
            <td className="py-1.5">
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROW_STATE[r.state].chip}`}>
                {ROW_STATE[r.state].label}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-1">Owed — included in the next CSV</p>
        {owed.length === 0 ? <p className="text-xs text-gray-400">Nothing owed right now.</p> : table(owed)}
        {owed.length > 0 && (
          <div className="flex justify-end gap-6 border-t border-gray-200 mt-1 pt-1.5 text-sm">
            {tutor.pending_deductions_ttd > 0 && (
              <span className="text-amber-700">Deduction −{fmtMoney(tutor.pending_deductions_ttd)}</span>
            )}
            <span className="font-bold text-gray-900">Subtotal {fmtMoney(tutor.owed_ttd)}</span>
          </div>
        )}
      </div>
      {tutor.refund_pending_count > 0 && (
        <p className="text-xs text-rose-700 flex items-center gap-1.5">
          <AlertTriangle className="size-3.5" />
          {tutor.refund_pending_count} payment(s) have a refund request and are held out of the CSV until it is resolved on
          <Link href="/admin/lesson-payments" className="underline">Lesson Payments</Link>.
        </p>
      )}
      {other.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1">Not in the next CSV</p>
          {table(other)}
        </div>
      )}
      {paidCount > 0 && (
        <button onClick={onTogglePaid} className="text-xs text-gray-500 hover:text-gray-800 underline">
          {showPaid ? 'Hide' : 'Show'} paid history ({paidCount})
        </button>
      )}
    </div>
  );
}
