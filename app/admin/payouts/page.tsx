'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

interface PendingTutor {
  tutor_id: string;
  tutor_name: string | null;
  tutor_email: string | null;
  total_ttd: number;
  line_count: number;
  has_payout_account: boolean;
  bank_name: string | null;
  branch: string | null;
  account_number: string | null;
}

interface Batch {
  id: string;
  generated_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  total_amount_ttd: number;
  line_count: number;
  status: 'exported' | 'paid' | 'cancelled';
  csv_filename: string | null;
}

export default function AdminPayoutsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [pendingTutors, setPendingTutors] = useState<PendingTutor[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [escrowTutors, setEscrowTutors] = useState<PendingTutor[]>([]);
  const [escrowTotal, setEscrowTotal] = useState(0);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [heldCount, setHeldCount] = useState(0);
  const [heldTotal, setHeldTotal] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
      await Promise.all([loadPending(), loadBatches(), loadHeld()]);
    })();
  }, []);

  async function loadPending() {
    const res = await fetch('/api/admin/payouts/pending');
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'Failed to load pending payouts');
      return;
    }
    setPendingTutors(json.tutors);
    setPendingTotal(json.total_amount_ttd);
    setEscrowTutors(json.escrow_tutors ?? []);
    setEscrowTotal(json.escrow_total_amount_ttd ?? 0);
  }

  async function loadHeld() {
    const [r1, r2] = await Promise.all([
      fetch('/api/admin/payout-cases?status=open&page_size=100'),
      fetch('/api/admin/payout-cases?status=under_review&page_size=100'),
    ]);
    const [j1, j2] = await Promise.all([r1.ok ? r1.json() : { cases: [], total: 0 }, r2.ok ? r2.json() : { cases: [], total: 0 }]);
    const allCases: any[] = [...(j1.cases ?? []), ...(j2.cases ?? [])];
    setHeldCount((j1.total ?? 0) + (j2.total ?? 0));
    const total = allCases.reduce((s: number, c: any) => s + Number(c.payout_ledger?.amount_ttd ?? 0), 0);
    setHeldTotal(Math.round(total * 100) / 100);
  }

  async function loadBatches() {
    const res = await fetch('/api/admin/payouts/batches');
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'Failed to load batches');
      return;
    }
    setBatches(json.batches);
  }

  async function exportBatch() {
    setError(''); setMessage(''); setWorking(true);
    try {
      // If nothing is release_ready but there are escrow rows, force-release them first.
      if (exportable.length === 0 && escrowTutors.length > 0) {
        const confirmed = confirm(
          `Release $${escrowTotal.toFixed(2)} TTD from escrow now (bypasses the 7-day window) and generate the CSV?`
        );
        if (!confirmed) { setWorking(false); return; }
        const rel = await fetch('/api/admin/payouts/force-release', { method: 'POST' });
        if (!rel.ok) {
          const relJson = await rel.json();
          throw new Error(relJson.error || 'Failed to release from escrow');
        }
        await loadPending();
      }

      const res = await fetch('/api/admin/payouts/export', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Export failed');

      const blob = new Blob([json.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = json.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const skippedNote = json.skipped?.length
        ? ` ${json.skipped.length} tutor(s) skipped due to missing bank details.`
        : '';
      setMessage(`Batch ${json.batch.id.slice(0, 8)} exported.${skippedNote}`);
      await Promise.all([loadPending(), loadBatches()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function markPaid(batchId: string) {
    if (!confirm('Confirm: the bank transfer for this batch has cleared. This decrements every tutor balance and cannot be undone.')) return;
    setError(''); setMessage(''); setWorking(true);
    try {
      const res = await fetch(`/api/admin/payouts/${batchId}/mark-paid`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to mark paid');
      setMessage(`Batch ${batchId.slice(0, 8)} marked as paid.`);
      await loadBatches();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function cancelBatch(batchId: string) {
    if (!confirm('Cancel this batch? Ledger items will be released back to the next export.')) return;
    setError(''); setMessage(''); setWorking(true);
    try {
      const res = await fetch(`/api/admin/payouts/${batchId}/cancel`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to cancel');
      setMessage(`Batch ${batchId.slice(0, 8)} cancelled.`);
      await Promise.all([loadPending(), loadBatches()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  // Combine escrow (owed) + ready rows into one list for display
  const allUnpaidTutors = [...escrowTutors, ...pendingTutors].reduce<PendingTutor[]>((acc, t) => {
    const existing = acc.find((x) => x.tutor_id === t.tutor_id);
    if (existing) {
      existing.total_ttd += t.total_ttd;
      existing.line_count += t.line_count;
    } else {
      acc.push({ ...t });
    }
    return acc;
  }, []);
  const allUnpaidTotal = escrowTotal + pendingTotal;
  const exportable = pendingTutors.filter((t) => t.has_payout_account);
  const tutorsMissingBank = allUnpaidTutors.filter((t) => !t.has_payout_account);

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Payouts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Generate the bank CSV for tutor payouts and reconcile each batch once the transfer clears.
            </p>
          </div>
          <Link href="/admin/dashboard" className="text-sm text-brand hover:underline">← Back to dashboard</Link>
        </div>

        {error && <div className="rounded-xl border border-red-300 bg-red-50 text-red-800 p-3 text-sm">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 p-3 text-sm">{message}</div>}

        {/* Unpaid earnings */}
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Unpaid earnings</h2>
              <p className="text-xs text-muted-foreground">
                All tutor earnings not yet paid out. Generate a CSV to batch-pay via bank transfer.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div>
              <div className="text-2xl font-bold text-ink">
                ${allUnpaidTotal.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">TTD</span>
              </div>
            </div>
          </div>

          {allUnpaidTutors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unpaid earnings.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-4">Tutor</th>
                    <th className="py-2 pr-4">Bank</th>
                    <th className="py-2 pr-4">Account</th>
                    <th className="py-2 pr-4 text-right">Sessions</th>
                    <th className="py-2 pr-0 text-right">Amount (TTD)</th>
                  </tr>
                </thead>
                <tbody>
                  {allUnpaidTutors.map((t) => (
                    <tr key={t.tutor_id} className="border-b border-border/50">
                      <td className="py-2 pr-4">
                        <div className="font-medium text-ink">{t.tutor_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{t.tutor_email}</div>
                      </td>
                      <td className="py-2 pr-4">
                        {t.has_payout_account
                          ? <span className="text-ink">{t.bank_name} <span className="text-xs text-muted-foreground">/ {t.branch}</span></span>
                          : <span className="text-amber-700 font-medium">Missing — tutor must add bank details</span>}
                      </td>
                      <td className="py-2 pr-4 text-ink">{t.account_number ? `••••${t.account_number.slice(-4)}` : '—'}</td>
                      <td className="py-2 pr-4 text-right">{t.line_count}</td>
                      <td className="py-2 text-right font-semibold text-ink">${t.total_ttd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {tutorsMissingBank.length > 0 && (
                <span className="text-amber-700">{tutorsMissingBank.length} tutor(s) skipped (no bank details). </span>
              )}
            </div>
            <button
              onClick={exportBatch}
              disabled={working || allUnpaidTutors.length === 0}
              className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-40"
            >
              {working ? 'Working…' : 'Generate batch CSV'}
            </button>
          </div>
        </section>

        {/* Held payouts */}
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-amber-900">Held payouts</h2>
              <p className="text-xs text-amber-700">
                Payouts frozen pending admin review (no-show claims, disputes, manual holds). These are excluded from CSV exports until resolved.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-amber-700 uppercase tracking-wider">Total held</div>
              <div className="text-2xl font-bold text-amber-900">
                ${heldTotal.toFixed(2)} <span className="text-sm font-normal text-amber-700">TTD</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-amber-800">
              {heldCount === 0 ? 'No held cases.' : `${heldCount} open case${heldCount !== 1 ? 's' : ''} awaiting resolution.`}
            </span>
            <Link
              href="/admin/payout-cases"
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors"
            >
              Review held payouts →
            </Link>
          </div>
        </section>

        {/* Batch history */}
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Batch history</h2>
            <p className="text-xs text-muted-foreground">Mark each batch as paid once the bank confirms the transfer.</p>
          </div>

          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No batches yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-4">Batch</th>
                    <th className="py-2 pr-4">Generated</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4 text-right">Lines</th>
                    <th className="py-2 pr-4 text-right">Amount (TTD)</th>
                    <th className="py-2 pr-0 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">{b.id.slice(0, 8)}</td>
                      <td className="py-2 pr-4">{new Date(b.generated_at).toLocaleString()}</td>
                      <td className="py-2 pr-4">
                        <span className={
                          b.status === 'paid' ? 'inline-block rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-medium' :
                          b.status === 'cancelled' ? 'inline-block rounded-full bg-zinc-200 text-zinc-700 px-2 py-0.5 text-xs font-medium' :
                          'inline-block rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium'
                        }>
                          {b.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">{b.line_count}</td>
                      <td className="py-2 pr-4 text-right font-semibold">${b.total_amount_ttd.toFixed(2)}</td>
                      <td className="py-2 pr-0 text-right space-x-2">
                        {b.status === 'exported' && (
                          <>
                            <button onClick={() => markPaid(b.id)} disabled={working}
                              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-40">
                              Mark paid
                            </button>
                            <button onClick={() => cancelBatch(b.id)} disabled={working}
                              className="px-3 py-1 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-xs font-medium disabled:opacity-40">
                              Cancel
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
