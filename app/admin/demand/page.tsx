'use client';

/**
 * /admin/demand — the demand map.
 *
 * Six tabs, one question each:
 *   Overview     — the headline numbers and the top of every ranking
 *   Subjects     — which subject to recruit for (rankable three ways)
 *   Times        — which times families want, overall and per subject
 *   Prices       — what families will pay, and what each price point serves
 *   Recruit      — subject × year × format: one card = one teacher to find
 *   Notify list  — every family who asked to be told, and how to reach them
 *
 * All arithmetic lives in lib/finder/demandMap.ts; this file only draws it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import type { DemandMap, NotifyEntry, NotifyStatus, SubjectRank } from '@/lib/finder/demandMap';
import {
  BarLegend,
  Card,
  Pill,
  RankBar,
  Segmented,
  Stat,
  fmtDate,
  money,
  pct,
} from '@/components/admin/demand/DemandUi';

type Tab = 'overview' | 'subjects' | 'times' | 'prices' | 'recruit' | 'notify';
type Range = '7' | '30' | '90' | 'all';

const TABS: Array<[Tab, string]> = [
  ['overview', 'Overview'],
  ['subjects', 'Subjects'],
  ['times', 'Times'],
  ['prices', 'Prices'],
  ['recruit', 'Recruit'],
  ['notify', 'Notify list'],
];

type Payload = DemandMap & { unavailable?: false; days: number | null };

export default function AdminDemandPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<Range>('all');

  // The tab lives in the URL so a link to "the notify list" opens on it.
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('tab');
      if (fromUrl && TABS.some(([t]) => t === fromUrl)) setTab(fromUrl as Tab);
    } catch {
      /* default tab */
    }
  }, []);

  const changeTab = (next: Tab) => {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* URL sync is a convenience */
    }
  };

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

  const load = useCallback(async (r: Range) => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/demand${r === 'all' ? '' : `?days=${r}`}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'failed');
      if (json.unavailable) {
        setUnavailable(true);
        setData(null);
      } else {
        setUnavailable(false);
        setData(json as Payload);
      }
    } catch {
      setFailed(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void load(range);
  }, [authLoading, load, range]);

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="flex items-center justify-center py-20 text-gray-500">Loading…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <AdminBreadcrumb items={[{ label: 'Demand Map' }]} />

        <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Demand Map</h1>
            <p className="mt-1 max-w-2xl text-gray-600">
              What families asked Find your iTutor for — which subjects, times and
              prices to recruit teachers for, and who to tell when they arrive.
            </p>
          </div>
          <Segmented<Range>
            value={range}
            onChange={setRange}
            options={[
              ['7', '7 days'],
              ['30', '30 days'],
              ['90', '90 days'],
              ['all', 'All time'],
            ]}
          />
        </header>

        <nav className="mt-6 border-b border-gray-200" aria-label="Demand Map sections">
          <div className="-mb-px flex gap-1 overflow-x-auto">
            {TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeTab(value)}
                className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                  tab === value
                    ? 'border-itutor-green text-itutor-green'
                    : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                }`}
              >
                {label}
                {value === 'notify' && data ? (
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                      tab === value ? 'bg-emerald-50 text-itutor-green' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {data.notifyList.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </nav>

        <div className="mt-6">
          {unavailable ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              The demand ledger is not available on this environment — migration 240
              has not been applied yet. Nothing is broken; there is simply nothing to
              read.
            </div>
          ) : failed ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              The demand map could not be loaded.{' '}
              <button type="button" className="font-semibold underline" onClick={() => load(range)}>
                Try again
              </button>
            </div>
          ) : loading || !data ? (
            <div className="py-16 text-center text-gray-500">Loading…</div>
          ) : data.totals.signals === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-gray-600 shadow-sm">
              No Finder requests in this period.
            </div>
          ) : (
            <>
              {data.totals.truncated ? (
                <p className="mb-4 text-sm text-amber-700">
                  Showing the most recent 5,000 requests only — older demand is not
                  counted in these figures.
                </p>
              ) : null}
              {tab === 'overview' ? <OverviewTab data={data} goTo={changeTab} /> : null}
              {tab === 'subjects' ? <SubjectsTab data={data} /> : null}
              {tab === 'times' ? <TimesTab data={data} /> : null}
              {tab === 'prices' ? <PricesTab data={data} /> : null}
              {tab === 'recruit' ? <RecruitTab data={data} /> : null}
              {tab === 'notify' ? <NotifyTab data={data} /> : null}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────

function OverviewTab({ data, goTo }: { data: Payload; goTo: (t: Tab) => void }) {
  const { totals } = data;
  const maxSubject = data.subjects[0]?.total ?? 0;
  const maxTime = data.times[0]?.total ?? 0;
  const maxPrice = data.prices[0]?.total ?? 0;
  const seeAll = (t: Tab) => (
    <button type="button" onClick={() => goTo(t)} className="text-sm font-semibold text-itutor-green hover:text-emerald-700">
      See all →
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Requests" value={totals.signals} hint={`${totals.clusters} distinct asks`} />
        <Stat
          label="Still unmet"
          value={totals.unmet}
          hint={`${pct(totals.signals ? totals.unmet / totals.signals : 0)} had no exact class`}
          tone="red"
        />
        <Stat
          label="Asked to be told"
          value={totals.optIns}
          hint={
            totals.optInsNoAddress > 0
              ? `${totals.optInsReachable} reachable · ${totals.optInsNoAddress} no email yet`
              : 'all reachable by email'
          }
          tone="green"
        />
        <Stat
          label="Served exactly"
          value={totals.exact}
          hint={`${totals.near} near miss · ${totals.fallback} subject only · ${totals.none} nothing`}
        />
      </div>

      {totals.unknownSubject > 0 ? (
        <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {totals.unknownSubject} older {totals.unknownSubject === 1 ? 'request has' : 'requests have'} no
          recorded subject — they predate subjects being saved as picked and could not be
          recovered. They are listed as &ldquo;Subject not recorded&rdquo;.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Most wanted subjects" subtitle="By requests. The solid bar is what is still unmet." action={seeAll('subjects')}>
          <BarLegend />
          <ol className="mt-2 divide-y divide-gray-100">
            {data.subjects.slice(0, 6).map((s, i) => (
              <RankBar
                key={s.key}
                rank={i + 1}
                label={s.label}
                total={s.total}
                unmet={s.unmet}
                max={maxSubject}
                right={<span><strong className="text-gray-900">{s.total}</strong> · {s.unmet} unmet</span>}
              />
            ))}
          </ol>
        </Card>

        <Card title="Most wanted times" subtitle="Families can pick several, so these add up to more than the requests." action={seeAll('times')}>
          <BarLegend />
          <ol className="mt-2 divide-y divide-gray-100">
            {data.times.map((t, i) => (
              <RankBar
                key={t.key}
                rank={i + 1}
                label={t.label}
                total={t.total}
                unmet={t.unmet}
                max={maxTime}
                right={<span><strong className="text-gray-900">{t.total}</strong> · {pct(t.share)}</span>}
              />
            ))}
          </ol>
        </Card>

        <Card title="What families will pay" subtitle="Monthly ceiling picked, most common first." action={seeAll('prices')}>
          <ol className="divide-y divide-gray-100">
            {data.prices.map((p, i) => (
              <RankBar
                key={p.key}
                rank={i + 1}
                label={p.label}
                total={p.total}
                unmet={p.unmet}
                max={maxPrice}
                right={<span><strong className="text-gray-900">{p.total}</strong> · {pct(p.share)}</span>}
              />
            ))}
          </ol>
        </Card>

        <Card title="Recruit next" subtitle="Ranked by families waiting to be told, then unmet demand." action={seeAll('recruit')}>
          <ol className="space-y-3">
            {data.clusters
              .filter(c => c.unmet > 0)
              .slice(0, 4)
              .map((c, i) => (
                <li key={c.key} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <span className="mt-0.5 w-5 text-right text-xs font-semibold text-gray-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {c.subject} <span className="font-normal text-gray-600">· {c.levelLabel} · {c.deliveryLabel}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      {c.unmet} unmet
                      {c.optIns > 0 ? ` · ${c.optIns} waiting to be told` : ''}
                      {c.times[0] ? ` · mostly ${c.times[0].label.toLowerCase()}` : ''}
                      {c.recommendedPrice !== null ? ` · price at ${money(c.recommendedPrice)}/mo` : ''}
                    </p>
                  </div>
                </li>
              ))}
          </ol>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By year">
          <ol className="divide-y divide-gray-100">
            {data.levels.map((l, i) => (
              <RankBar key={l.key} rank={i + 1} label={l.label} total={l.total} unmet={l.unmet} max={data.levels[0]?.total ?? 0} />
            ))}
          </ol>
        </Card>
        <Card title="Online or in person">
          <ol className="divide-y divide-gray-100">
            {data.delivery.map((d, i) => (
              <RankBar key={d.key} rank={i + 1} label={d.label} total={d.total} unmet={d.unmet} max={data.delivery[0]?.total ?? 0} />
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Subjects
// ─────────────────────────────────────────────────────────────────────────

type SubjectSort = 'total' | 'unmet' | 'optIns';

function SubjectsTab({ data }: { data: Payload }) {
  const [sort, setSort] = useState<SubjectSort>('total');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? data.subjects.filter(s => s.label.toLowerCase().includes(q)) : data.subjects;
    return [...filtered].sort(
      (a: SubjectRank, b: SubjectRank) =>
        b[sort] - a[sort] || b.total - a.total || a.label.localeCompare(b.label)
    );
  }, [data.subjects, sort, query]);

  return (
    <Card
      title="Subjects, ranked"
      subtitle="Each subject merges every spelling families used (“CSEC Mathematics” and “Mathematics” are one)."
      action={
        <Segmented<SubjectSort>
          value={sort}
          onChange={setSort}
          options={[
            ['total', 'Most requested'],
            ['unmet', 'Most unmet'],
            ['optIns', 'Most waiting'],
          ]}
        />
      }
    >
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search subjects…"
        className="mb-4 w-full rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-itutor-green focus:outline-none focus:ring-2 focus:ring-itutor-green/20 sm:max-w-xs"
      />
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3 text-left">#</th>
              <th className="px-3 py-3 text-left">Subject</th>
              <th className="px-3 py-3 text-right">Requests</th>
              <th className="px-3 py-3 text-right">Unmet</th>
              <th className="px-3 py-3 text-right">Waiting</th>
              <th className="px-3 py-3 text-left">Top year</th>
              <th className="px-3 py-3 text-left">Top time</th>
              <th className="px-5 py-3 text-right">Price at</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((s, i) => (
              <tr key={s.key} className="hover:bg-gray-50">
                <td className="px-5 py-3 tabular-nums text-gray-400">{i + 1}</td>
                <td className="px-3 py-3">
                  <p className="font-medium text-gray-900">{s.label}</p>
                  <p className="text-xs text-gray-500">
                    {pct(s.share)} of requests · last {fmtDate(s.lastAskedAt)}
                  </p>
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">{s.total}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  <span className={s.unmet > 0 ? 'font-semibold text-red-600' : 'text-gray-500'}>{s.unmet}</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  <span className={s.optIns > 0 ? 'font-semibold text-itutor-green' : 'text-gray-500'}>{s.optIns}</span>
                </td>
                <td className="px-3 py-3 text-gray-700">
                  {s.topLevel ?? '—'}
                  {s.levels.length > 1 ? <span className="text-xs text-gray-500"> +{s.levels.length - 1}</span> : null}
                </td>
                <td className="px-3 py-3 text-gray-700">{s.topTime ?? '—'}</td>
                <td className="px-5 py-3 text-right font-medium tabular-nums text-gray-900">
                  {s.recommendedPrice !== null ? `${money(s.recommendedPrice)}/mo` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-gray-600">
        <strong>Waiting</strong> = asked to be told when a class opens. <strong>Price at</strong> = the
        highest monthly price at least 75% of these families said they would pay.
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Times
// ─────────────────────────────────────────────────────────────────────────

function TimesTab({ data }: { data: Payload }) {
  const max = data.times[0]?.total ?? 0;
  const gridMax = Math.max(0, ...data.timeGrid.rows.flatMap(r => r.counts));

  return (
    <div className="space-y-6">
      <Card title="Times, ranked" subtitle="How many requests named each time. Families can pick several.">
        <BarLegend />
        <ol className="mt-2 divide-y divide-gray-100">
          {data.times.map((t, i) => (
            <RankBar
              key={t.key}
              rank={i + 1}
              label={t.label}
              total={t.total}
              unmet={t.unmet}
              max={max}
              right={
                <span>
                  <strong className="text-gray-900">{t.total}</strong> · {pct(t.share)} of requests
                </span>
              }
              sub={`${t.unmet} unmet · ${t.optIns} waiting to be told`}
            />
          ))}
        </ol>
      </Card>

      <Card title="Times by subject" subtitle="The ten most-requested subjects. Darker = more families want that time.">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-y border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
              <tr>
                <th className="px-5 py-3 text-left uppercase tracking-wider text-gray-500">Subject</th>
                {data.timeGrid.blocks.map(b => (
                  <th key={b.key} className="px-2 py-3 text-center font-semibold">
                    {b.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.timeGrid.rows.map(row => (
                <tr key={row.subject}>
                  <td className="px-5 py-2.5 font-medium text-gray-900">{row.subject}</td>
                  {row.counts.map((count, i) => {
                    const strength = gridMax ? count / gridMax : 0;
                    return (
                      <td key={i} className="px-2 py-2 text-center">
                        <span
                          className={`inline-flex h-8 w-12 items-center justify-center rounded-md text-sm font-semibold tabular-nums ${
                            count === 0
                              ? 'bg-gray-50 text-gray-300'
                              : strength > 0.6
                                ? 'bg-itutor-green text-white'
                                : strength > 0.3
                                  ? 'bg-emerald-300 text-emerald-950'
                                  : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {count}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Prices
// ─────────────────────────────────────────────────────────────────────────

function PricesTab({ data }: { data: Payload }) {
  const max = data.prices[0]?.total ?? 0;
  const priced = [...data.subjects].filter(s => s.recommendedPrice !== null).slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {data.pricePoints.map(p => (
          <div key={p.price} className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">A class at {money(p.price)}/month</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{pct(p.servesShare)}</p>
            <p className="mt-0.5 text-xs text-gray-600">of families could afford it ({p.servesCount} of {data.totals.signals})</p>
            <div className="mt-3 h-2 rounded-full bg-gray-100">
              <div className="h-2 rounded-full bg-itutor-green" style={{ width: `${p.servesShare * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <Card title="Budgets, ranked" subtitle="The monthly ceiling families picked, most common first.">
        <BarLegend />
        <ol className="mt-2 divide-y divide-gray-100">
          {data.prices.map((p, i) => (
            <RankBar
              key={p.key}
              rank={i + 1}
              label={p.label}
              total={p.total}
              unmet={p.unmet}
              max={max}
              right={
                <span>
                  <strong className="text-gray-900">{p.total}</strong> · {pct(p.share)}
                </span>
              }
              sub={`${p.unmet} unmet · ${p.optIns} waiting to be told`}
            />
          ))}
        </ol>
      </Card>

      <Card title="Price to quote, by subject" subtitle="The highest price at least 75% of that subject's families said they would pay.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {priced.map(s => (
            <li key={s.key} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <span className="truncate text-sm font-medium text-gray-900">{s.label}</span>
              <span className="ml-3 shrink-0 text-sm font-semibold tabular-nums text-itutor-green">
                {money(s.recommendedPrice)}/mo
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Recruit (clusters)
// ─────────────────────────────────────────────────────────────────────────

type ClusterFilter = 'unmet' | 'optins' | 'all';

function RecruitTab({ data }: { data: Payload }) {
  const [filter, setFilter] = useState<ClusterFilter>('unmet');
  const shown = data.clusters.filter(c =>
    filter === 'optins' ? c.optIns > 0 : filter === 'unmet' ? c.unmet > 0 : true
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <p className="font-semibold">How to read this tab</p>
        <p className="mt-1">
          Each card is <strong>one teacher worth recruiting</strong>. It groups every request for
          the same subject, year and format (online or in person), because one class could serve
          all of them. It shows who asked, when they want lessons, what they will pay and a
          suggested monthly price. Cards with families waiting to be told come first.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Segmented<ClusterFilter>
          value={filter}
          onChange={setFilter}
          options={[
            ['unmet', 'Needs a teacher'],
            ['optins', 'Families waiting'],
            ['all', 'Everything'],
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-600 shadow-sm">
          Nothing in this view.
        </div>
      ) : (
        shown.map((c, i) => <RecruitCard key={c.key} c={c} rank={i + 1} />)
      )}
    </div>
  );
}

type ClusterRow = Payload['clusters'][number];
type ClusterRequestRow = ClusterRow['requests'][number];

/**
 * Who asked, in the best words we have. Find your iTutor asks a PARENT for the
 * child's first name; it never asks a student for a name. So: the account name
 * when they signed up, the child's name a parent typed, else an honest
 * "Visitor".
 */
function personLabel(r: ClusterRequestRow): { primary: string; secondary: string | null } {
  if (r.name && r.learner) return { primary: r.name, secondary: `Parent of ${r.learner}` };
  if (r.name) {
    return {
      primary: r.name,
      secondary: r.role === 'parent' ? 'Parent' : r.role === 'student' ? 'Student' : null,
    };
  }
  if (r.learner) {
    return { primary: `${r.learner}'s parent`, secondary: r.hasAccount ? null : 'No account yet' };
  }
  return r.hasAccount
    ? { primary: 'Account with no name', secondary: null }
    : { primary: 'Visitor', secondary: 'No account, so no name given' };
}

function RecruitCard({ c, rank }: { c: ClusterRow; rank: number }) {
  const [open, setOpen] = useState(rank <= 3);
  const timeMax = c.times[0]?.count ?? 0;
  const families = c.total === 1 ? '1 family' : `${c.total} families`;
  const format = c.delivery === 'unspecified' ? 'format not recorded' : c.deliveryLabel.toLowerCase();

  return (
    <article className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Recruit #{rank}
            </p>
            <h3 className="mt-0.5 text-lg font-semibold text-gray-900">
              {c.subject} · {c.levelLabel}
            </h3>
            <p className="mt-1 text-sm text-gray-700">
              <strong>{families}</strong> asked for {c.subject}, {c.levelLabel}, {format}.{' '}
              {c.unmet === c.total
                ? 'None of them got an exact class.'
                : `${c.unmet} still without an exact class.`}
              {c.optIns > 0 ? ` ${c.optIns} asked us to tell them when one opens.` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {c.optIns > 0 ? <Pill tone="green">{c.optIns} waiting to be told</Pill> : null}
            {c.urgentNow > 0 ? <Pill tone="amber">{c.urgentNow} want it right away</Pill> : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Best time</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">{c.times[0]?.label ?? '—'}</p>
            <p className="text-xs text-gray-600">
              {c.times[0] ? `${c.times[0].count} of ${families} can do it` : ''}
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Suggested price</p>
            <p className="mt-0.5 text-sm font-semibold text-itutor-green">
              {c.recommendedPrice !== null ? `${money(c.recommendedPrice)} / month` : '—'}
            </p>
            <p className="text-xs text-gray-600">at least 3 in 4 of them can pay this</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Format</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              {c.delivery === 'unspecified' ? 'Not recorded' : c.deliveryLabel}
            </p>
            <p className="text-xs text-gray-600">
              {c.delivery === 'unspecified' ? 'asked before this question existed' : 'what they asked for'}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Times they can do (families pick several)
            </p>
            <ul className="mt-2 space-y-1.5">
              {c.times.map(t => (
                <li key={t.block} className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 text-gray-800">{t.label}</span>
                  <span className="h-2 flex-1 rounded-full bg-gray-100">
                    <span
                      className="block h-2 rounded-full bg-itutor-green"
                      style={{ width: `${timeMax ? (t.count / timeMax) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="w-6 text-right font-semibold tabular-nums text-gray-900">{t.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Monthly budget they picked</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.prices.map(p => (
                <Pill key={p.label}>
                  {p.label}: <strong className="text-gray-900">{p.count}</strong>
                </Pill>
              ))}
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
              What Find your iTutor showed them
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.none > 0 ? <Pill tone="red">No class at all: {c.none}</Pill> : null}
              {c.fallback > 0 ? <Pill tone="amber">Same subject, wrong fit: {c.fallback}</Pill> : null}
              {c.near > 0 ? <Pill tone="amber">Almost a fit: {c.near}</Pill> : null}
              {c.exact > 0 ? <Pill tone="green">Exact class: {c.exact}</Pill> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
        >
          <span>Who asked ({c.total})</span>
          <span className="text-itutor-green">{open ? 'Hide' : 'Show'}</span>
        </button>
        {open ? (
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="py-2 pr-3 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Times</th>
                  <th className="px-3 py-2 text-left">Budget</th>
                  <th className="px-3 py-2 text-left">We showed</th>
                  <th className="py-2 pl-3 text-left">Asked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {c.requests.map(r => {
                  const who = personLabel(r);
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-gray-900">{who.primary}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          {who.secondary ? <span className="text-xs text-gray-600">{who.secondary}</span> : null}
                          {r.waiting ? <Pill tone="green">Waiting to be told</Pill> : null}
                          {r.urgency === 'Right away' ? <Pill tone="amber">Right away</Pill> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{r.times.join(', ') || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-700">{r.budgetLabel}</td>
                      <td className="px-3 py-2.5 text-gray-700">{r.shown}</td>
                      <td className="py-2.5 pl-3 tabular-nums text-gray-700">{fmtDate(r.askedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Notify list
// ─────────────────────────────────────────────────────────────────────────

type NotifyFilter = 'waiting' | 'no_address' | 'done' | 'all';

const STATUS_PILL: Record<NotifyStatus, { label: string; tone: 'gray' | 'green' | 'amber' | 'red' | 'blue' }> = {
  waiting: { label: 'Waiting for a class', tone: 'amber' },
  notified: { label: 'Emailed', tone: 'green' },
  resolved_not_sent: { label: 'Class opened, not emailed', tone: 'blue' },
  no_address: { label: 'No email yet', tone: 'red' },
};

function csvCell(value: string | null): string {
  const v = value ?? '';
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function NotifyTab({ data }: { data: Payload }) {
  const [filter, setFilter] = useState<NotifyFilter>('waiting');
  const [copied, setCopied] = useState(false);

  const list = data.notifyList.filter((e: NotifyEntry) =>
    filter === 'all'
      ? true
      : filter === 'done'
        ? e.status === 'notified' || e.status === 'resolved_not_sent'
        : e.status === filter
  );
  const emails = Array.from(new Set(list.map(e => e.email).filter((e): e is string => Boolean(e))));

  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(emails.join(', '));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const downloadCsv = () => {
    const header = ['Name', 'Email', 'Email source', 'Learner', 'Subject', 'Year', 'Format', 'Times', 'Budget', 'Urgency', 'Asked', 'Status'];
    const lines = list.map(e =>
      [
        e.name,
        e.email,
        e.emailSource,
        e.learner,
        e.subject,
        e.levelLabel,
        e.deliveryLabel,
        e.times.join('; '),
        e.budgetLabel,
        e.urgency,
        e.askedAt.slice(0, 10),
        STATUS_PILL[e.status].label,
      ]
        .map(csvCell)
        .join(',')
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `itutor-notify-list-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = {
    waiting: data.notifyList.filter(e => e.status === 'waiting').length,
    no_address: data.notifyList.filter(e => e.status === 'no_address').length,
    done: data.notifyList.filter(e => e.status === 'notified' || e.status === 'resolved_not_sent').length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Asked to be told" value={data.notifyList.length} />
        <Stat label="Waiting for a class" value={counts.waiting} tone="amber" hint="emailed automatically when an exact class opens" />
        <Stat label="No email yet" value={counts.no_address} tone="red" hint="opted in, never finished signing up" />
        <Stat label="Class opened" value={counts.done} tone="green" />
      </div>

      <Card
        title="Families to tell"
        subtitle="Everyone who asked to be told when a class opens. The daily resolve-demand job emails them the moment an exact match is published."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyEmails}
              disabled={emails.length === 0}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {copied ? 'Copied' : `Copy ${emails.length} email${emails.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={list.length === 0}
              className="rounded-xl bg-itutor-green px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Download CSV
            </button>
          </div>
        }
      >
        <div className="mb-4">
          <Segmented<NotifyFilter>
            value={filter}
            onChange={setFilter}
            options={[
              ['waiting', `Waiting (${counts.waiting})`],
              ['no_address', `No email (${counts.no_address})`],
              ['done', `Class opened (${counts.done})`],
              ['all', 'All'],
            ]}
          />
        </div>

        {list.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-600">Nobody in this view.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left">Family</th>
                  <th className="px-3 py-3 text-left">Wants</th>
                  <th className="px-3 py-3 text-left">When</th>
                  <th className="px-3 py-3 text-left">Budget</th>
                  <th className="px-3 py-3 text-left">Asked</th>
                  <th className="px-5 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.map(e => (
                  <tr key={e.id} className="align-top hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{e.name ?? (e.email ? 'No account' : 'Anonymous visitor')}</p>
                      {e.email ? (
                        <a href={`mailto:${e.email}`} className="text-itutor-green hover:text-emerald-700">
                          {e.email}
                        </a>
                      ) : (
                        <p className="text-gray-500">—</p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {e.emailSource === 'typed' ? <Pill tone="blue">Typed on results</Pill> : null}
                        {e.role ? <Pill>{e.role}</Pill> : null}
                        {e.learner ? <Pill>for {e.learner}</Pill> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-900">{e.subject}</p>
                      <p className="text-gray-600">
                        {e.levelLabel} · {e.deliveryLabel}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-gray-700">{e.times.join(', ') || '—'}</td>
                    <td className="px-3 py-3 text-gray-700">
                      {e.budgetLabel}
                      {e.urgency ? <p className="text-xs text-gray-500">{e.urgency}</p> : null}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-gray-700">{fmtDate(e.askedAt)}</td>
                    <td className="px-5 py-3">
                      <Pill tone={STATUS_PILL[e.status].tone}>{STATUS_PILL[e.status].label}</Pill>
                      {e.notifiedAt ? <p className="mt-1 text-xs text-gray-500">{fmtDate(e.notifiedAt)}</p> : null}
                      {e.resolvedBy ? <p className="mt-1 text-xs text-gray-500">{e.resolvedBy}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
