'use client';
// TTD/USD exchange rates used for tutor USD payouts (migration 260).
// Shows the stored CBTT rates and lets an admin enter the day's rate by hand
// when the scraper fails. A manual rate is never overwritten by the cron.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

interface RateRow {
  rate_date: string;
  ttd_per_usd: number;
  source: 'cbtt' | 'manual' | string;
  published_date: string | null;
  fetched_at: string;
}

function todayPortOfSpain(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Port_of_Spain', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export default function AdminFxRatesPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rateDate, setRateDate] = useState(todayPortOfSpain());
  const [rateValue, setRateValue] = useState('');
  const [saving, setSaving] = useState(false);
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
    })();
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/fx-rate');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load rates');
      setRates((json.rates ?? []).map((r: any) => ({ ...r, ttd_per_usd: Number(r.ttd_per_usd) })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  async function save() {
    setSaving(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/admin/fx-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate_date: rateDate, ttd_per_usd: Number(rateValue) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save rate');
      setMessage(
        `Saved TT$${Number(json.ttd_per_usd).toFixed(4)} = US$1 for ${json.rate_date}.` +
        (json.restamped ? ` ${json.restamped} waiting payout${json.restamped === 1 ? '' : 's'} converted.` : ''),
      );
      setRateValue('');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return null;

  const today = todayPortOfSpain();
  const latest = rates[0];
  const stale = !latest || latest.rate_date < today;

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="max-w-4xl space-y-6">
        <AdminBreadcrumb items={[{ label: 'Finance' }, { label: 'Exchange Rates' }]} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TTD / USD exchange rate</h1>
          <p className="text-sm text-gray-500 mt-1">
            Central Bank of Trinidad &amp; Tobago selling rate, used to convert tutor USD payouts. Each payout is
            locked at the rate for the day the student paid. Saving a rate here never changes payouts that already
            have one.
          </p>
        </div>

        <div className={`rounded-xl border p-4 ${stale ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          {latest ? (
            <div className="text-sm">
              <span className="font-semibold text-gray-900">
                Latest: TT${latest.ttd_per_usd.toFixed(4)} = US$1
              </span>
              <span className="text-gray-600"> · {latest.rate_date} · {latest.source === 'manual' ? 'entered by admin' : 'fetched from CBTT'}</span>
              {stale && (
                <div className="mt-1 text-amber-800">
                  No rate for today yet. Earnings paid today will wait for one before they can be batched.
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-amber-800">No rates stored yet. USD payouts cannot be converted until one is entered.</div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="font-semibold text-gray-900">Enter a rate</div>
          <p className="text-xs text-gray-500">
            Copy the US dollar <strong>selling</strong> rate from the CBTT exchange-rates page. Accepted range 6.0 to 7.5.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-gray-700">
              Date
              <input type="date" value={rateDate} max={today} onChange={(e) => setRateDate(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-700">
              TT$ per US$1
              <input type="number" step="0.0001" min="6" max="7.5" value={rateValue} placeholder="6.7950"
                onChange={(e) => setRateValue(e.target.value)}
                className="mt-1 block w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums" />
            </label>
            <button type="button" onClick={save} disabled={saving || !rateValue}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save rate'}
            </button>
          </div>
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-right">TT$ per US$1</th>
                <th className="px-4 py-2 text-left">Source</th>
                <th className="px-4 py-2 text-left">Recorded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
              ) : rates.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No rates yet.</td></tr>
              ) : rates.map((r) => (
                <tr key={r.rate_date}>
                  <td className="px-4 py-2 text-gray-900">{r.rate_date}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">{r.ttd_per_usd.toFixed(4)}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.source === 'manual' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'}`}>
                      {r.source === 'manual' ? 'Manual' : 'CBTT'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{new Date(r.fetched_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
