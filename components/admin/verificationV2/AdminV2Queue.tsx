'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { useProfile } from '@/lib/hooks/useProfile';

const TABS: { status: string; label: string }[] = [
  { status: 'review', label: 'Needs review' },
  { status: 'waiting', label: 'Waiting on teacher' },
  { status: 'done', label: 'Done' },
];

export interface Item {
  tutorId: string;
  name: string | null;
  email: string | null;
  status: string;
  identityStatus: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  credentialCount: number;
  extraCount: number;
}

interface ReverifyReport {
  dryRun: boolean;
  matched: number;
  changed: number;
  skipped: number;
  failed: { tutorId: string; error: string }[];
}

/** DD Mon YYYY, the site's date format. */
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const IDENTITY_LABEL: Record<string, string> = {
  verified: 'Passed',
  pending: 'Started',
  processing: 'Checking',
  retryable_failure: 'Failed, can retry',
  not_supported: 'Cannot check',
  consent_declined: 'Declined',
  canceled: 'Cancelled',
};

/** The queue's table with no fetching. Also used by the dev states gallery. */
interface DiditTestResult {
  ok: boolean;
  connection: { ok: boolean; status: number | null; message: string; sessionCreated?: boolean; hostedUrlReceived?: boolean };
  settings: { apiKey: boolean; workflowId: boolean; workflowIdLooksValid: boolean; webhookSecret: boolean };
  notes: string[];
}

/** Admin only. Creates and deletes a throwaway sandbox session; shows pass or fail, never a secret. */
function DiditTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DiditTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/verification-v2/didit-test', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not run the test');
      setResult(body as DiditTestResult);
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <button
        onClick={run}
        disabled={busy}
        className="px-3 py-2 rounded-lg text-sm font-medium transition-all bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-60"
      >
        {busy ? 'Testing…' : 'Test Didit connection'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {result && (
        <div
          role="status"
          className={`mt-2 rounded-lg border p-3 text-sm ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800'}`}
        >
          <p className="font-semibold">{result.ok ? 'Didit is connected.' : 'Didit is not ready.'}</p>
          <p className="mt-1">{result.connection.message}</p>
          {result.notes.map((n) => (
            <p key={n} className="mt-1">
              {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function QueueTable({ items, status, loading = false }: { items: Item[]; status: string; loading?: boolean }) {
  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
          <span className="ml-3 text-gray-600">Loading queue…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 border-2 border-gray-200 rounded-lg">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Nothing here</h2>
          <p className="text-gray-600">Applications will appear in this list as teachers send them in.</p>
        </div>
      ) : (
        <div className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teacher</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credentials</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Extras</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{status === 'review' ? 'Submitted' : 'Updated'}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((i) => (
              <tr key={i.tutorId} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{i.name ?? 'Unnamed'}</div>
                  <div className="text-sm text-gray-500">{i.email}</div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{i.identityStatus ? IDENTITY_LABEL[i.identityStatus] ?? i.identityStatus : 'Not checked'}</td>
                {/* A zero is never shown. */}
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{i.credentialCount > 0 ? i.credentialCount : '—'}</td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{i.extraCount > 0 ? i.extraCount : '—'}</td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{fmt(status === 'review' ? i.submittedAt : i.decidedAt ?? i.submittedAt)}</td>
                <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <Link href={`/admin/verification-v2/${i.tutorId}`} className="text-itutor-green hover:text-emerald-700 font-semibold">
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </>
  );
}

export default function AdminV2Queue() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [status, setStatus] = useState('review');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ provider: string; primary: boolean; missing: string[]; message: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/verification-v2/queue?tab=${status}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load the queue');
      setItems(body.items);
      setSetup(body.setup ?? []);
      setCounts(body.counts ?? {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || (!profile.is_reviewer && profile.role !== 'admin')) {
      router.push('/login');
      return;
    }
    void load();
  }, [profile, profileLoading, router, load]);

  if (profileLoading || !profile) return null;
  const isAdmin = profile.role === 'admin';
  const displayName = profile.display_name || profile.full_name || 'Admin';

  return (
    <DashboardLayout role={isAdmin ? 'admin' : 'reviewer'} userName={displayName}>
      <div className="max-w-6xl mx-auto">
        <AdminBreadcrumb items={[{ label: 'Operations' }, { label: 'Teacher verification' }]} />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Teacher verification</h1>
        <p className="text-gray-600 mb-6">
          Identity is checked by an outside provider. You see the pass or fail result and the teacher&apos;s
          credentials. ID images are never stored by iTutor and never shown here.
        </p>

        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              onClick={() => setStatus(t.status)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                status === t.status ? 'bg-itutor-green text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {t.label}
              {/* A zero is never shown. */}
              {counts[t.status] > 0 ? ` (${counts[t.status]})` : ''}
            </button>
          ))}
        </div>

        {isAdmin && <DiditTest />}

        {setup.map((p) => (
          <div
            key={p.provider}
            role="alert"
            className={`mb-4 rounded-lg border p-3 text-sm ${p.primary ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
          >
            <strong>{p.primary ? 'Identity check is not available. ' : 'Backup provider incomplete. '}</strong>
            {p.message}
          </div>
        ))}

        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>}

        <QueueTable items={items} status={status} loading={loading} />

        {isAdmin && <ReverifyPanel onDone={load} />}
      </div>
    </DashboardLayout>
  );
}

/** Admin only. Always shows a dry run first; applying is a second, explicit click. */
function ReverifyPanel({ onDone }: { onDone: () => void }) {
  const [scope, setScope] = useState<'verified' | 'pending' | 'both'>('verified');
  const [reason, setReason] = useState('');
  const [report, setReport] = useState<ReverifyReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(apply: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/verification-v2/reverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, reason, apply }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      setReport(body);
      if (apply) onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 bg-white border-2 border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-bold">Ask teachers to verify again</h2>
      <p className="mt-1 text-sm text-gray-600">
        Sets the status to &ldquo;reverification required&rdquo;. This is not a rejection and not a revoke, and
        it sends no message. Teachers see it next time they open their verification page. Preview first.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as any);
            setReport(null);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="verified">Existing verified teachers</option>
          <option value="pending">Applicants mid-review (old flow)</option>
          <option value="both">Both</option>
        </select>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (recorded in the audit log)"
          className="min-w-[16rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={() => run(false)}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Preview
        </button>
        {report?.dryRun && report.matched > 0 && (
          <button
            onClick={() => {
              if (confirm(`Ask ${report.matched} teacher(s) to verify again?`)) void run(true);
            }}
            disabled={busy}
            className="rounded-lg bg-itutor-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Apply to {report.matched}
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {report && (
        <p className="mt-3 text-sm text-gray-700">
          {report.dryRun
            ? `Preview: ${report.matched} teacher(s) would change.`
            : `Done: ${report.changed} changed, ${report.skipped} skipped, ${report.failed.length} failed.`}
        </p>
      )}
    </div>
  );
}
