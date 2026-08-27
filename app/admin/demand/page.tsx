'use client';

/**
 * /admin/demand — the demand map.
 *
 * The recruitment worklist. Every row is a sentence a recruiter can say out
 * loud: "four families want CSEC Physics on Saturday mornings, in person, under
 * $400 a month, and three of them asked us to tell them when it opens."
 *
 * WHY OPT-INS ARE THE HEADLINE NUMBER AND NOT THE COUNT. A cluster of twenty
 * families who shrugged is a worse lead than four who left an email address, and
 * ranking by raw volume sends the recruiter to the wrong one. The count is shown
 * next to it so the ranking can be argued with rather than merely trusted.
 *
 * WHY THE NO-MATCH COLUMN MATTERS MORE THAN THE EXACT ONE. `exact` means the
 * platform already worked. `none` is the row that only a new teacher can fix,
 * and `fallback` is the row where we showed a family something in the subject
 * but not what they asked for — which is a softer version of the same gap.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

type Cluster = {
  key: string;
  subject: string;
  levelLabel: string;
  deliveryLabel: string;
  total: number;
  unresolved: number;
  optIns: number;
  exact: number;
  near: number;
  fallback: number;
  none: number;
  topBlocks: Array<{ block: string; label: string; count: number }>;
  lowestBudgetCeiling: number | null;
  firstAskedAt: string;
  lastAskedAt: string;
};

type Totals = {
  signals: number;
  unresolved: number;
  optIns: number;
  exact: number;
  near: number;
  fallback: number;
  none: number;
  clusters: number;
  truncated: boolean;
};

type Filter = 'unmet' | 'optins' | 'all';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-TT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p> : null}
    </div>
  );
}

export default function AdminDemandPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState<Filter>('unmet');

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin') {
        router.push('/login');
        return;
      }
      if (isEmailManagementOnlyAdmin(profile.email)) {
        router.replace('/admin/emails');
        return;
      }
      setAuthLoading(false);
    })();
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/demand', { cache: 'no-store' });
      const json = await res.json();
      setClusters(json.clusters ?? []);
      setTotals(json.totals ?? null);
      setUnavailable(Boolean(json.unavailable));
    } catch {
      setClusters([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>
      </DashboardLayout>
    );
  }

  const shown = clusters.filter(c => {
    if (filter === 'optins') return c.optIns > 0;
    // "Unmet" is not just `none`: a fallback row means a family was shown
    // something in the subject that did not fit what they asked for, which is
    // the same missing teacher wearing a politer label.
    if (filter === 'unmet') return c.none > 0 || c.fallback > 0 || c.near > 0;
    return true;
  });

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <AdminBreadcrumb items={[{ label: 'Demand Map' }]} />

        <header className="mt-4">
          <h1 className="text-2xl font-semibold text-white">Demand Map</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            What families asked Find your iTutor for, clustered by subject, year
            and how they want to learn. Ranked by the families who asked to be
            told when a class opens — the ones worth calling a teacher about.
          </p>
        </header>

        {unavailable ? (
          <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            The demand ledger is not available on this environment — migration
            240 has not been applied yet. Nothing is broken; there is simply
            nothing to read.
          </div>
        ) : null}

        {totals ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Requests" value={String(totals.signals)} hint="all time" />
            <Stat
              label="Asked to be told"
              value={String(totals.optIns)}
              hint="committed demand"
            />
            <Stat
              label="Nothing to show"
              value={String(totals.none)}
              hint="no class in the subject"
            />
            <Stat
              label="Subject only"
              value={String(totals.fallback)}
              hint="wrong time, year or price"
            />
            <Stat label="Clusters" value={String(totals.clusters)} />
          </div>
        ) : null}

        {totals?.truncated ? (
          <p className="mt-3 text-[12px] text-amber-300">
            Showing the most recent 5,000 requests only — older demand is not
            counted in these figures.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ['unmet', 'Needs a teacher'],
              ['optins', 'Asked to be told'],
              ['all', 'Everything'],
            ] as Array<[Filter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
                filter === value
                  ? 'bg-green-brand text-white'
                  : 'border border-gray-700 bg-gray-800/60 text-gray-300 hover:bg-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading…</div>
        ) : shown.length === 0 ? (
          <div className="mt-6 rounded-xl border border-gray-700 bg-gray-800/40 px-4 py-10 text-center text-sm text-gray-400">
            {clusters.length === 0
              ? 'No Finder requests recorded yet.'
              : 'Nothing in this view. Every cluster here was served.'}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {shown.map(cluster => (
              <article
                key={cluster.key}
                className="rounded-xl border border-gray-700 bg-gray-800/60 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-white">
                      {cluster.subject}
                    </h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-400">
                      <span>{cluster.levelLabel}</span>
                      <span aria-hidden>·</span>
                      <span>{cluster.deliveryLabel}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {cluster.lowestBudgetCeiling === null
                          ? 'No budget ceiling given'
                          : `Serves everyone at $${cluster.lowestBudgetCeiling}/month`}
                      </span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {cluster.optIns > 0 ? (
                      <span className="rounded-full bg-green-brand/20 px-3 py-1 text-[12px] font-semibold text-green-300">
                        {cluster.optIns} asked to be told
                      </span>
                    ) : null}
                    <span className="rounded-full border border-gray-600 px-3 py-1 text-[12px] text-gray-300">
                      {cluster.total} {cluster.total === 1 ? 'request' : 'requests'}
                    </span>
                  </div>
                </div>

                {cluster.topBlocks.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">
                      When they want it
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {cluster.topBlocks.map(block => (
                        <span
                          key={block.block}
                          className="rounded-lg bg-gray-900/70 px-2.5 py-1 text-[12px] text-gray-200"
                        >
                          {block.label}
                          <span className="ml-1.5 text-gray-500">{block.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-gray-400">
                  <div>
                    <dt className="inline text-gray-500">Nothing to show: </dt>
                    <dd className="inline font-medium text-gray-200">{cluster.none}</dd>
                  </div>
                  <div>
                    <dt className="inline text-gray-500">Subject only: </dt>
                    <dd className="inline font-medium text-gray-200">{cluster.fallback}</dd>
                  </div>
                  <div>
                    <dt className="inline text-gray-500">Near miss: </dt>
                    <dd className="inline font-medium text-gray-200">{cluster.near}</dd>
                  </div>
                  <div>
                    <dt className="inline text-gray-500">Served: </dt>
                    <dd className="inline font-medium text-gray-200">{cluster.exact}</dd>
                  </div>
                  <div>
                    <dt className="inline text-gray-500">Still unmet: </dt>
                    <dd className="inline font-medium text-gray-200">{cluster.unresolved}</dd>
                  </div>
                  <div>
                    <dt className="inline text-gray-500">Asked: </dt>
                    <dd className="inline text-gray-300">
                      {cluster.firstAskedAt === cluster.lastAskedAt
                        ? fmtDate(cluster.firstAskedAt)
                        : `${fmtDate(cluster.firstAskedAt)} – ${fmtDate(cluster.lastAskedAt)}`}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
