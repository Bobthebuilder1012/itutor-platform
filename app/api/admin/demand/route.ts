// GET /api/admin/demand — the demand map.
//
// Answers one question: WHICH TEACHER SHOULD WE RECRUIT NEXT. Every Finder run
// writes a demand_signals row, including the ones we served, because "what are
// families asking for" and "what did we fail to serve" are different questions
// and only the first tells acquisition where to look.
//
// CLUSTERED IN TYPESCRIPT, NOT SQL, DELIBERATELY. The natural instinct is a
// GROUP BY over unnest(availability_blocks) — the indexes in migration 240 were
// even built for it. But the level column carries two vocabularies and the
// subject name needs the same normalisation the matcher uses, so a SQL grouping
// would split "CSEC Mathematics" and "Mathematics" into two clusters and rank
// both below a cluster that is really the same demand. The ledger is in the
// hundreds of rows; correctness is worth more than the pushdown here.
//
// RANKED BY OPT-INS, NOT RAW COUNT. A cluster of twenty shrugs is worth less
// than a cluster of four families who asked to be told. Raw count is returned
// alongside so the ranking can be argued with, but the default order is the one
// that reflects commitment.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { levelLabel, type CanonicalLevel } from '@/lib/matching/levels';
import { availabilityLabel } from '@/lib/finder/wizard';
import type { AvailabilityBlock } from '@/lib/matching/availability';

export const dynamic = 'force-dynamic';

/** Rows read per request. The ledger is small; this is a runaway guard. */
const MAX_ROWS = 5000;

interface SignalRow {
  id: string;
  subject_id: string | null;
  level: string | null;
  availability_blocks: string[] | null;
  budget_max: number | string | null;
  delivery_pref?: string | null;
  match_class: string | null;
  notify_optin: boolean;
  resolved_at: string | null;
  created_at: string;
  subject: { name: string | null } | null;
}

/**
 * Widest first: delivery_pref lands in migration 243. Without the tier this
 * whole page 500s on an environment one migration behind, which is precisely
 * the environment someone would be looking at it on.
 */
const SELECT_TIERS = [
  `id, subject_id, level, availability_blocks, budget_max, delivery_pref,
   match_class, notify_optin, resolved_at, created_at, subject:subjects(name)`,
  `id, subject_id, level, availability_blocks, budget_max,
   match_class, notify_optin, resolved_at, created_at, subject:subjects(name)`,
];

function isSchemaMismatch(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Cluster key. Subject and level identify the teacher to recruit; delivery
 * splits the cluster because an online cluster and an in-person cluster in the
 * same subject need DIFFERENT teachers, so a combined count is not actionable.
 */
function clusterKey(row: SignalRow): string {
  const subject = (row.subject?.name ?? 'Unknown subject').trim().toLowerCase();
  const level = (row.level ?? 'any').trim().toUpperCase();
  const delivery = (row.delivery_pref ?? 'unspecified').trim().toLowerCase();
  return `${subject}||${level}||${delivery}`;
}

const DELIVERY_LABELS: Record<string, string> = {
  online: 'Online',
  in_person: 'In person',
  either: 'Either',
  unspecified: 'Not asked',
};

interface Cluster {
  key: string;
  subject: string;
  level: string | null;
  levelLabel: string;
  delivery: string;
  deliveryLabel: string;
  /** Every signal in the cluster, resolved or not. */
  total: number;
  /** Still unmet — the number recruitment acts on. */
  unresolved: number;
  /** Committed demand: asked to be told when a class opens. */
  optIns: number;
  /** How the Finder answered these families. */
  exact: number;
  near: number;
  fallback: number;
  none: number;
  /** Blocks, most-wanted first — the timetable a new class should take. */
  topBlocks: Array<{ block: string; label: string; count: number }>;
  /**
   * The LOWEST ceiling in the cluster, not the average.
   *
   * A class priced at the mean serves half the cluster and disappoints the rest.
   * The lowest ceiling is the price that serves everyone who asked, which is the
   * number a recruiter should quote a prospective teacher.
   */
  lowestBudgetCeiling: number | null;
  firstAskedAt: string;
  lastAskedAt: string;
}

export async function GET(_req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const service = getServiceClient();

  let rows: SignalRow[] | null = null;
  for (const columns of SELECT_TIERS) {
    const { data, error } = await service
      .from('demand_signals')
      .select(columns)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);

    if (!error) {
      rows = (data ?? []) as unknown as SignalRow[];
      break;
    }
    if (!isSchemaMismatch(error)) {
      console.error('[admin/demand] read failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (rows === null) {
    // Most likely migration 240 is not applied on this environment.
    return NextResponse.json(
      { clusters: [], totals: null, unavailable: true },
      { status: 200 }
    );
  }

  const byKey = new Map<string, Cluster>();
  const blockCounts = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const key = clusterKey(row);

    let cluster = byKey.get(key);
    if (!cluster) {
      const level = row.level ?? null;
      cluster = {
        key,
        subject: row.subject?.name ?? 'Unknown subject',
        level,
        levelLabel: level ? levelLabel(level as CanonicalLevel) : 'Any year',
        delivery: row.delivery_pref ?? 'unspecified',
        deliveryLabel: DELIVERY_LABELS[row.delivery_pref ?? 'unspecified'] ?? 'Either',
        total: 0,
        unresolved: 0,
        optIns: 0,
        exact: 0,
        near: 0,
        fallback: 0,
        none: 0,
        topBlocks: [],
        lowestBudgetCeiling: null,
        firstAskedAt: row.created_at,
        lastAskedAt: row.created_at,
      };
      byKey.set(key, cluster);
      blockCounts.set(key, new Map());
    }

    cluster.total += 1;
    if (!row.resolved_at) cluster.unresolved += 1;
    if (row.notify_optin) cluster.optIns += 1;

    if (row.match_class === 'exact') cluster.exact += 1;
    else if (row.match_class === 'near') cluster.near += 1;
    else if (row.match_class === 'fallback') cluster.fallback += 1;
    else cluster.none += 1;

    const budget = toNumber(row.budget_max);
    // Null budget_max means "no limit", which is not a low ceiling and must not
    // be allowed to become one — it is skipped rather than treated as zero.
    if (budget !== null) {
      cluster.lowestBudgetCeiling =
        cluster.lowestBudgetCeiling === null
          ? budget
          : Math.min(cluster.lowestBudgetCeiling, budget);
    }

    if (row.created_at < cluster.firstAskedAt) cluster.firstAskedAt = row.created_at;
    if (row.created_at > cluster.lastAskedAt) cluster.lastAskedAt = row.created_at;

    const blocks = blockCounts.get(key)!;
    for (const block of row.availability_blocks ?? []) {
      blocks.set(block, (blocks.get(block) ?? 0) + 1);
    }
  }

  const clusters = Array.from(byKey.values()).map(cluster => {
    const blocks = blockCounts.get(cluster.key)!;
    return {
      ...cluster,
      topBlocks: Array.from(blocks.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([block, count]) => ({
          block,
          label: availabilityLabel(block as AvailabilityBlock),
          count,
        })),
    };
  });

  // Opt-ins first, then unmet volume, then total. See the header: commitment
  // beats headcount.
  clusters.sort(
    (a, b) => b.optIns - a.optIns || b.unresolved - a.unresolved || b.total - a.total
  );

  const totals = {
    signals: rows.length,
    unresolved: rows.filter(r => !r.resolved_at).length,
    optIns: rows.filter(r => r.notify_optin).length,
    exact: rows.filter(r => r.match_class === 'exact').length,
    near: rows.filter(r => r.match_class === 'near').length,
    fallback: rows.filter(r => r.match_class === 'fallback').length,
    none: rows.filter(
      r => r.match_class === 'none' || r.match_class === null
    ).length,
    clusters: clusters.length,
    // Stated so a reader can tell a complete picture from a truncated one.
    truncated: rows.length >= MAX_ROWS,
  };

  return NextResponse.json({ clusters, totals, unavailable: false });
}
