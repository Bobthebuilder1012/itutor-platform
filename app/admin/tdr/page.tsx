'use client';

/**
 * TDR — the number §5 is judged by.
 *
 * ADMIN IS DARK. Everything else in this feature uses the tutor tokens
 * (bg-card, text-ink, bg-brand); carrying those in here produces a page that
 * looks broken beside every other admin screen. Gray-800 panels, white text,
 * green-brand accent — the palette the rest of /admin already uses.
 *
 * The client-side auth re-check is not belt-and-braces: app/admin/layout.tsx
 * only enforces the permissive 'email-management' scope, so a marketing admin
 * reaches this route and must be sent to their own area.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

type Row = {
  tutorId: string;
  name: string;
  email: string | null;
  verifiedAt: string;
  daysSince: number;
  joined14: number;
  joinedAll: number;
  invited: number;
  inWindow: boolean;
};

type Payload = {
  unavailable: boolean;
  target: number;
  activatedTeachers: number;
  studentsBrought: number;
  students14: number;
  tdr: number;
  tdr14: number;
  median: number;
  teachersAtGoal: number;
  teachersWithNone: number;
  distribution: Array<{ bucket: string; count: number }>;
  rows: Row[];
  truncated?: boolean;
};

const WINDOWS = [
  { label: 'All time', days: 0 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

type Cohort = 'all' | 'in_window' | 'closed_empty' | 'at_goal';

export default function AdminTdrPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [days, setDays] = useState(0);
  const [cohort, setCohort] = useState<Cohort>('all');

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_reviewer, email')
        .eq('id', auth.user.id)
        .maybeSingle();
      const p = profile as { role: string | null; is_reviewer: boolean | null; email: string | null } | null;
      if (!p || (p.role !== 'admin' && !p.is_reviewer)) {
        router.replace('/');
        return;
      }
      if (isEmailManagementOnlyAdmin(p.email)) {
        router.replace('/admin/emails');
        return;
      }
      setAuthLoading(false);
    })();
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/metrics/tdr?days=${days}`, { cache: 'no-store' });
      const body = await res.json();
      if (res.ok) setData(body as Payload);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  if (authLoading) return null;

  const rows = (data?.rows ?? []).filter((r) => {
    if (cohort === 'in_window') return r.inWindow;
    if (cohort === 'closed_empty') return !r.inWindow && r.joinedAll === 0;
    if (cohort === 'at_goal') return r.joined14 >= (data?.target ?? 5);
    return true;
  });

  const maxBucket = Math.max(1, ...(data?.distribution ?? []).map((d) => d.count));

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="space-y-6">
        <AdminBreadcrumb items={[{ label: 'Teacher Distribution Ratio' }]} />

        <div>
          <h1 className="text-2xl font-bold text-white">Teacher Distribution Ratio</h1>
          <p className="mt-1 text-sm text-gray-400">
            Students brought by teachers ÷ activated teachers. Target ≥ {data?.target ?? 5};
            long term 10+.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              className={
                days === w.days
                  ? 'rounded-full bg-green-brand px-4 py-1.5 text-sm font-semibold text-white'
                  : 'rounded-full border border-gray-700 px-4 py-1.5 text-sm text-gray-300 hover:bg-gray-800'
              }
            >
              {w.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-gray-400">Loading…</p>}

        {data?.unavailable && (
          <div className="rounded-lg border border-amber-600/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
            Migration 258 has not run in this environment, so there is nothing to
            measure yet.
          </div>
        )}

        {data && !data.unavailable && (
          <>
            <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-5">
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">TDR</div>
                  <div className="mt-1 text-4xl font-bold text-white tabular-nums">
                    {data.tdr.toFixed(2)}
                  </div>
                </div>
                <div className="pb-1 text-sm text-gray-400">
                  target {data.target} · first 14 days{' '}
                  <span className="text-white tabular-nums">{data.tdr14.toFixed(2)}</span>
                </div>
              </div>
              <div className="mt-4 h-2 rounded-full bg-gray-700 overflow-hidden">
                <div
                  className="h-full bg-green-brand transition-all"
                  style={{ width: `${Math.min(100, (data.tdr / data.target) * 100)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Stat label="Activated teachers" value={data.activatedTeachers} />
              <Stat label="Students brought" value={data.studentsBrought} />
              <Stat label="Median per teacher" value={data.median} />
              <Stat label="Hit 5+ in 14 days" value={data.teachersAtGoal} />
              <Stat label="Brought nobody" value={data.teachersWithNone} />
            </div>

            <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-5">
              <h2 className="text-sm font-semibold text-white">Distribution</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                How many teachers brought how many students.
              </p>
              <div className="mt-4 space-y-2">
                {data.distribution.map((d) => (
                  <div key={d.bucket} className="flex items-center gap-3">
                    <div className="w-10 shrink-0 text-xs text-gray-400 tabular-nums">{d.bucket}</div>
                    <div className="flex-1 h-5 rounded bg-gray-700 overflow-hidden">
                      <div
                        className="h-full bg-green-brand/70"
                        style={{ width: `${(d.count / maxBucket) * 100}%` }}
                      />
                    </div>
                    <div className="w-20 shrink-0 text-right text-xs text-gray-300 tabular-nums">
                      {d.count}
                      {data.activatedTeachers > 0 && (
                        <span className="text-gray-500">
                          {' '}
                          ({Math.round((d.count / data.activatedTeachers) * 100)}%)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', 'All teachers'],
                  ['in_window', 'In their first 14 days'],
                  ['closed_empty', 'Window closed with 0'],
                  ['at_goal', 'Hit 5+'],
                ] as Array<[Cohort, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCohort(key)}
                  className={
                    cohort === key
                      ? 'rounded-full bg-green-brand px-4 py-1.5 text-sm font-semibold text-white'
                      : 'rounded-full border border-gray-700 px-4 py-1.5 text-sm text-gray-300 hover:bg-gray-800'
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-gray-700 bg-gray-800/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/50 text-gray-400">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Teacher</th>
                      <th className="px-4 py-2.5 text-left font-medium">Verified</th>
                      <th className="px-4 py-2.5 text-right font-medium">In 14 days</th>
                      <th className="px-4 py-2.5 text-right font-medium">All time</th>
                      <th className="px-4 py-2.5 text-right font-medium">Invited</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {rows.map((r) => (
                      <tr key={r.tutorId} className="hover:bg-gray-800">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/accounts/${r.tutorId}`}
                            className="text-white hover:text-green-brand"
                          >
                            {r.name}
                          </Link>
                          <div className="text-xs text-gray-500">{r.email}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-300">
                          {new Date(r.verifiedAt).toLocaleDateString('en-TT', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                          <div className="text-xs text-gray-500">
                            {r.inWindow ? `day ${r.daysSince + 1} of 14` : `${r.daysSince}d ago`}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-white">{r.joined14}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-white">{r.joinedAll}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{r.invited}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                          No teachers in that cohort.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {data.truncated && (
              <p className="text-xs text-gray-500">
                Showing the most recent 1000 activated teachers; older ones are not
                counted in the figures above.
              </p>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white tabular-nums">{value}</div>
    </div>
  );
}
