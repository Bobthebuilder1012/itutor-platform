'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { useProfile } from '@/lib/hooks/useProfile';

const TABS: { status: string; label: string }[] = [
  { status: 'IN_REVIEW', label: 'In review' },
  { status: 'REVERIFICATION_REQUIRED', label: 'Reverification' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'REJECTED', label: 'Rejected' },
  { status: 'VERIFIED', label: 'Verified' },
  { status: 'REVOKED', label: 'Revoked' },
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

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

/** The queue's table with no fetching. Also used by the dev states gallery. */
export function QueueTable({ items, status, loading = false }: { items: Item[]; status: string; loading?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {loading ? (
        <p className="p-6 text-sm text-gray-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="p-6 text-sm text-gray-500">Nothing here.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Teacher</th>
              <th className="px-4 py-3">Identity</th>
              <th className="px-4 py-3">Credentials</th>
              <th className="px-4 py-3">Extras</th>
              <th className="px-4 py-3">{status === 'IN_REVIEW' ? 'Submitted' : 'Decided'}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((i) => (
              <tr key={i.tutorId}>
                <td className="px-4 py-3">
                  <p className="font-medium">{i.name ?? 'Unnamed'}</p>
                  <p className="text-xs text-gray-500">{i.email}</p>
                </td>
                <td className="px-4 py-3">{i.identityStatus ?? '—'}</td>
                <td className="px-4 py-3">{i.credentialCount}</td>
                <td className="px-4 py-3">{i.extraCount}</td>
                <td className="px-4 py-3">{fmt(status === 'IN_REVIEW' ? i.submittedAt : i.decidedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/verification-v2/${i.tutorId}`} className="font-semibold text-[#199356] hover:underline">
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AdminV2Queue() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [status, setStatus] = useState('IN_REVIEW');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/verification-v2/queue?status=${status}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load the queue');
      setItems(body.items);
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
      <div className="mx-auto max-w-5xl px-4 py-6 text-gray-900">
        <AdminBreadcrumb items={[{ label: 'Operations' }, { label: 'Verification v2' }]} />
        <h1 className="mb-1 text-2xl font-bold">Teacher verification (v2)</h1>
        <p className="mb-5 text-sm text-gray-600">
          Identity is checked by Stripe. You see the pass or fail result and the teacher&apos;s credentials. ID
          images are never stored by iTutor and never shown here.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.status}
              onClick={() => setStatus(t.status)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                status === t.status ? 'bg-[#199356] text-white' : 'border border-gray-300 bg-white text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

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
    <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
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
            className="rounded-lg bg-[#199356] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
