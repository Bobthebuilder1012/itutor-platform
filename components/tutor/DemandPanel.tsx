'use client';

/**
 * "Families are asking for this" — the tutor-facing demand panel.
 *
 * Sits above the student browser on /tutor/find-students. The page's existing
 * job is "look through students one by one"; this is the same question answered
 * in aggregate, and it is the answer that leads to a decision. A tutor scrolling
 * 200 student cards learns nothing about whether to open a Saturday class.
 *
 * RENDERS NOTHING WHEN THERE IS NOTHING. No empty state, no "no demand yet"
 * card. This panel is an interruption to a page that already works, so it earns
 * its space only when it has something to say — and a permanent empty box
 * teaches tutors to scroll past the area where the useful thing will eventually
 * appear.
 *
 * NO CONTACT AFFORDANCE, DELIBERATELY. Every number here is a count. The
 * families asked to be told when a class opens, by us, once — they did not agree
 * to be approached by whichever teacher saw their request. The action offered is
 * therefore "create a class", not "message them", and the API returns no
 * identity to make the other option possible.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Cluster = {
  key: string;
  subject: string;
  levelLabel: string;
  deliveryLabel: string;
  families: number;
  optIns: number;
  unserved: number;
  topBlocks: Array<{ label: string; count: number }>;
  lowestBudgetCeiling: number | null;
  lastAskedAt: string;
};

export default function DemandPanel() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tutor/demand', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setClusters(json.clusters ?? []);
      } catch {
        // Silent. This panel is additive; a failed fetch must leave the page
        // it sits on exactly as it was.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || clusters.length === 0) return null;

  const shown = expanded ? clusters : clusters.slice(0, 3);
  const committed = clusters.reduce((sum, c) => sum + c.optIns, 0);

  return (
    <section
      className="mb-6 rounded-2xl border border-itutor-green/30 bg-emerald-50/60 p-4 sm:p-5"
      aria-label="Demand in your subjects"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            Families are asking for this
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            From students who used Find your iTutor and looked for your subjects.
            {committed > 0 ? (
              <>
                {' '}
                <span className="font-semibold text-emerald-700">
                  {committed} asked to be told when a class opens.
                </span>
              </>
            ) : null}
          </p>
        </div>
        <Link
          href="/tutor/classes/new"
          className="shrink-0 rounded-xl bg-itutor-green px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Create a class
        </Link>
      </div>

      <ul className="mt-4 space-y-2">
        {shown.map(cluster => (
          <li
            key={cluster.key}
            className="rounded-xl border border-emerald-100 bg-white px-4 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">
                  {cluster.subject}
                  <span className="ml-2 text-[13px] font-normal text-gray-500">
                    {cluster.levelLabel} · {cluster.deliveryLabel}
                  </span>
                </p>
                {cluster.topBlocks.length > 0 ? (
                  <p className="mt-1 text-[13px] text-gray-600">
                    Wanted{' '}
                    {cluster.topBlocks.map((block, index) => (
                      <span key={block.label}>
                        {index > 0 ? ', ' : ''}
                        <span className="font-medium text-gray-800">
                          {block.label.toLowerCase()}
                        </span>
                        {' '}({block.count})
                      </span>
                    ))}
                  </p>
                ) : null}
                {cluster.lowestBudgetCeiling !== null ? (
                  <p className="mt-0.5 text-[13px] text-gray-500">
                    {/* The lowest ceiling, not the average: a class priced at the
                        mean turns away half the families in this row. */}
                    Priced at ${cluster.lowestBudgetCeiling}/month or under, every
                    one of them can afford it
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[12px] font-semibold text-emerald-800">
                  {cluster.families} {cluster.families === 1 ? 'family' : 'families'}
                </span>
                {cluster.unserved > 0 ? (
                  <span className="text-[11px] text-gray-500">
                    {cluster.unserved} found nothing that fit
                  </span>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {clusters.length > 3 ? (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-3 text-[13px] font-semibold text-emerald-700 underline underline-offset-2"
        >
          {expanded ? 'Show less' : `Show ${clusters.length - 3} more`}
        </button>
      ) : null}
    </section>
  );
}
