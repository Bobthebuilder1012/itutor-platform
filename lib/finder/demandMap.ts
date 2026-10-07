/**
 * The Demand Map's arithmetic, kept out of the route so it can be checked
 * without a database (scripts/verify-demand-map.ts).
 *
 * Input is the raw demand_signals ledger (one row per Finder run); output is
 * every ranking the admin page shows:
 *
 *   subjects   — which subject to recruit for, by requests / unmet / opt-ins
 *   times      — which blocks families want, and which subjects want them
 *   prices     — what families will pay, and what each price point would serve
 *   levels, delivery — the same, for year and online/in-person
 *   clusters   — subject × year × delivery: one row = one teacher to recruit
 *   notifyList — every family who asked to be told, with how to reach them
 *
 * CLUSTERED IN TYPESCRIPT, NOT SQL. The subject needs subjectKey() so "CSEC
 * Mathematics" and "Mathematics" are one demand, and the ledger is hundreds of
 * rows — correctness is worth more than the pushdown.
 *
 * "UNMET" means not exact. A fallback (subject only) or near miss was shown
 * SOMETHING, but not what was asked for — the same missing teacher wearing a
 * politer label. Signals resolve_demand has since closed are not unmet.
 */

import { AVAILABILITY_BLOCKS, type AvailabilityBlock } from '@/lib/matching/availability';
import { levelLabel, type CanonicalLevel } from '@/lib/matching/levels';
import { BUDGET_BANDS } from '@/lib/finder/wizard';
import { signalSubjectLabel, subjectKey } from '@/lib/finder/demandSubject';

export interface DemandSignalRow {
  id: string;
  user_id?: string | null;
  subject_id: string | null;
  subject_text?: string | null;
  level: string | null;
  availability_blocks: string[] | null;
  budget_max: number | string | null;
  delivery_pref?: string | null;
  match_class: string | null;
  notify_optin: boolean;
  notify_email?: string | null;
  notify_requested_at?: string | null;
  notified_at?: string | null;
  resolved_at: string | null;
  resolved_by?: string | null;
  created_at: string;
  subject: { name: string | null } | null;
  request?: {
    role?: string | null;
    child_label?: string | null;
    urgency?: string | null;
    lesson_type?: string | null;
  } | null;
}

export interface ContactInfo {
  name: string | null;
  email: string | null;
  role: string | null;
}

export const UNKNOWN_SUBJECT = 'Subject not recorded';

const DELIVERY_LABELS: Record<string, string> = {
  online: 'Online',
  in_person: 'In person',
  either: 'Online or in person',
  unspecified: 'Not asked',
};

const URGENCY_LABELS: Record<string, string> = {
  now: 'Right away',
  this_month: 'This month',
  exploring: 'Just looking',
};

/** The price points a class can be pitched at — the wizard's band ceilings. */
const PRICE_POINTS = BUDGET_BANDS.map(b => b.max).filter((m): m is number => m !== null);

/** Share of a group a class at `price` would serve: ceiling ≥ price, or none. */
function servedShare(ceilings: Array<number | null>, price: number): number {
  if (ceilings.length === 0) return 0;
  return ceilings.filter(c => c === null || c >= price).length / ceilings.length;
}

/**
 * The highest band price that still serves at least 75% of the group.
 *
 * Pricing at the lowest ceiling serves everyone but leaves money on the table;
 * pricing at the average disappoints half. Three quarters is the line: a
 * recruiter can quote it to a teacher and know most of the families can pay.
 */
export function recommendedPrice(ceilings: Array<number | null>): number | null {
  if (ceilings.length === 0) return null;
  let best: number | null = null;
  for (const price of PRICE_POINTS) {
    if (servedShare(ceilings, price) >= 0.75) best = price;
  }
  return best ?? PRICE_POINTS[0] ?? null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isUnmet(row: DemandSignalRow): boolean {
  return !row.resolved_at && row.match_class !== 'exact';
}

function blockLabel(block: string): string {
  return AVAILABILITY_BLOCKS.find(b => b.value === block)?.label ?? block;
}

export function budgetLabel(max: number | null): string {
  if (max === null) return 'No limit';
  return BUDGET_BANDS.find(b => b.max === max)?.label.replace(' a month', '') ?? `Up to $${max}`;
}

function levelText(level: string | null): string {
  return level ? levelLabel(level as CanonicalLevel) : 'Any year';
}

/** Counts in a ranked list. `share` is of ALL requests in the view. */
export interface Ranked {
  key: string;
  label: string;
  total: number;
  unmet: number;
  optIns: number;
  share: number;
}

export interface SubjectRank extends Ranked {
  /** Most-asked year, time and price — "what would the class look like". */
  topLevel: string | null;
  topTime: string | null;
  recommendedPrice: number | null;
  levels: Array<{ label: string; count: number }>;
  lastAskedAt: string;
}

export interface PriceRank extends Ranked {
  max: number | null;
}

export interface PricePoint {
  price: number;
  /** Of every request in the view, how many a class at this price serves. */
  servesShare: number;
  servesCount: number;
}

export interface Cluster {
  key: string;
  subject: string;
  level: string | null;
  levelLabel: string;
  delivery: string;
  deliveryLabel: string;
  total: number;
  unmet: number;
  optIns: number;
  urgentNow: number;
  exact: number;
  near: number;
  fallback: number;
  none: number;
  times: Array<{ block: string; label: string; count: number }>;
  prices: Array<{ label: string; max: number | null; count: number }>;
  recommendedPrice: number | null;
  firstAskedAt: string;
  lastAskedAt: string;
}

export type NotifyStatus = 'waiting' | 'notified' | 'resolved_not_sent' | 'no_address';

export interface NotifyEntry {
  id: string;
  name: string | null;
  email: string | null;
  /** Where the address comes from: their account, typed on the results page, or nowhere yet. */
  emailSource: 'account' | 'typed' | 'none';
  role: string | null;
  learner: string | null;
  subject: string;
  levelLabel: string;
  deliveryLabel: string;
  times: string[];
  budgetLabel: string;
  urgency: string | null;
  matchClass: string | null;
  askedAt: string;
  status: NotifyStatus;
  notifiedAt: string | null;
  resolvedBy: string | null;
}

export interface Totals {
  signals: number;
  unmet: number;
  optIns: number;
  optInsReachable: number;
  optInsNoAddress: number;
  exact: number;
  near: number;
  fallback: number;
  none: number;
  unknownSubject: number;
  clusters: number;
  truncated: boolean;
}

export interface DemandMap {
  totals: Totals;
  subjects: SubjectRank[];
  times: Ranked[];
  /** Subject rows × block columns, unmet+met counts. Top subjects only. */
  timeGrid: { blocks: Array<{ key: string; label: string }>; rows: Array<{ subject: string; counts: number[]; total: number }> };
  prices: PriceRank[];
  pricePoints: PricePoint[];
  levels: Ranked[];
  delivery: Ranked[];
  clusters: Cluster[];
  notifyList: NotifyEntry[];
}

/** Tally helper for the flat rankings. */
class Tally {
  private map = new Map<string, Ranked>();
  constructor(private readonly totalRequests: number) {}
  add(key: string, label: string, row: DemandSignalRow) {
    let r = this.map.get(key);
    if (!r) {
      r = { key, label, total: 0, unmet: 0, optIns: 0, share: 0 };
      this.map.set(key, r);
    }
    r.total += 1;
    if (isUnmet(row)) r.unmet += 1;
    if (row.notify_optin) r.optIns += 1;
  }
  ranked(): Ranked[] {
    return Array.from(this.map.values())
      .map(r => ({ ...r, share: this.totalRequests ? r.total / this.totalRequests : 0 }))
      .sort((a, b) => b.total - a.total || b.unmet - a.unmet || b.optIns - a.optIns);
  }
}

function countTop(map: Map<string, number>): Array<[string, number]> {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function buildDemandMap(
  rows: DemandSignalRow[],
  contacts: Map<string, ContactInfo>,
  classNames: Map<string, string>,
  truncated: boolean
): DemandMap {
  const n = rows.length;

  // ── Subjects ────────────────────────────────────────────────────────────
  interface SubjectAcc {
    rank: SubjectRank;
    levels: Map<string, number>;
    times: Map<string, number>;
    ceilings: Array<number | null>;
  }
  const subjects = new Map<string, SubjectAcc>();

  // ── Flat rankings ───────────────────────────────────────────────────────
  const times = new Tally(n);
  const levels = new Tally(n);
  const delivery = new Tally(n);
  const priceTally = new Map<string, PriceRank>();

  // ── Clusters ────────────────────────────────────────────────────────────
  interface ClusterAcc {
    cluster: Cluster;
    times: Map<string, number>;
    prices: Map<string, { label: string; max: number | null; count: number }>;
    ceilings: Array<number | null>;
  }
  const clusters = new Map<string, ClusterAcc>();

  const notifyList: NotifyEntry[] = [];
  const allCeilings: Array<number | null> = [];

  for (const row of rows) {
    const subjectName = signalSubjectLabel(row) ?? UNKNOWN_SUBJECT;
    const sKey = subjectKey(subjectName) || 'unknown';
    const ceiling = toNumber(row.budget_max);
    const blocks = (row.availability_blocks ?? []).filter(Boolean);
    const lvl = levelText(row.level);
    const deliveryKey = row.delivery_pref ?? 'unspecified';
    const unmet = isUnmet(row);
    allCeilings.push(ceiling);

    // Subjects
    let s = subjects.get(sKey);
    if (!s) {
      s = {
        rank: {
          key: sKey,
          label: subjectName,
          total: 0,
          unmet: 0,
          optIns: 0,
          share: 0,
          topLevel: null,
          topTime: null,
          recommendedPrice: null,
          levels: [],
          lastAskedAt: row.created_at,
        },
        levels: new Map(),
        times: new Map(),
        ceilings: [],
      };
      subjects.set(sKey, s);
    }
    // The canonical spelling wins the display label over a family's spelling.
    if (row.subject?.name) s.rank.label = row.subject.name;
    s.rank.total += 1;
    if (unmet) s.rank.unmet += 1;
    if (row.notify_optin) s.rank.optIns += 1;
    if (row.created_at > s.rank.lastAskedAt) s.rank.lastAskedAt = row.created_at;
    s.levels.set(lvl, (s.levels.get(lvl) ?? 0) + 1);
    for (const b of blocks) s.times.set(b, (s.times.get(b) ?? 0) + 1);
    s.ceilings.push(ceiling);

    // Flat
    for (const b of blocks) times.add(b, blockLabel(b), row);
    levels.add(row.level ?? 'any', lvl, row);
    delivery.add(deliveryKey, DELIVERY_LABELS[deliveryKey] ?? deliveryKey, row);

    const pKey = ceiling === null ? 'none' : String(ceiling);
    let p = priceTally.get(pKey);
    if (!p) {
      p = { key: pKey, label: budgetLabel(ceiling), max: ceiling, total: 0, unmet: 0, optIns: 0, share: 0 };
      priceTally.set(pKey, p);
    }
    p.total += 1;
    if (unmet) p.unmet += 1;
    if (row.notify_optin) p.optIns += 1;

    // Clusters
    const cKey = `${sKey}||${row.level ?? 'any'}||${deliveryKey}`;
    let c = clusters.get(cKey);
    if (!c) {
      c = {
        cluster: {
          key: cKey,
          subject: subjectName,
          level: row.level ?? null,
          levelLabel: lvl,
          delivery: deliveryKey,
          deliveryLabel: DELIVERY_LABELS[deliveryKey] ?? deliveryKey,
          total: 0,
          unmet: 0,
          optIns: 0,
          urgentNow: 0,
          exact: 0,
          near: 0,
          fallback: 0,
          none: 0,
          times: [],
          prices: [],
          recommendedPrice: null,
          firstAskedAt: row.created_at,
          lastAskedAt: row.created_at,
        },
        times: new Map(),
        prices: new Map(),
        ceilings: [],
      };
      clusters.set(cKey, c);
    }
    const cl = c.cluster;
    if (row.subject?.name) cl.subject = row.subject.name;
    cl.total += 1;
    if (unmet) cl.unmet += 1;
    if (row.notify_optin) cl.optIns += 1;
    if (row.request?.urgency === 'now') cl.urgentNow += 1;
    if (row.match_class === 'exact') cl.exact += 1;
    else if (row.match_class === 'near') cl.near += 1;
    else if (row.match_class === 'fallback') cl.fallback += 1;
    else cl.none += 1;
    if (row.created_at < cl.firstAskedAt) cl.firstAskedAt = row.created_at;
    if (row.created_at > cl.lastAskedAt) cl.lastAskedAt = row.created_at;
    for (const b of blocks) c.times.set(b, (c.times.get(b) ?? 0) + 1);
    const cp = c.prices.get(pKey) ?? { label: budgetLabel(ceiling), max: ceiling, count: 0 };
    cp.count += 1;
    c.prices.set(pKey, cp);
    c.ceilings.push(ceiling);

    // Notify list
    if (row.notify_optin) {
      const contact = row.user_id ? contacts.get(row.user_id) ?? null : null;
      const accountEmail = contact?.email ?? null;
      const email = accountEmail ?? row.notify_email ?? null;
      const status: NotifyStatus = row.notified_at
        ? 'notified'
        : !email
          ? 'no_address'
          : row.resolved_at
            ? 'resolved_not_sent'
            : 'waiting';
      notifyList.push({
        id: row.id,
        name: contact?.name ?? null,
        email,
        emailSource: accountEmail ? 'account' : row.notify_email ? 'typed' : 'none',
        role: contact?.role ?? row.request?.role ?? null,
        learner: row.request?.child_label?.trim() || null,
        subject: subjectName,
        levelLabel: lvl,
        deliveryLabel: DELIVERY_LABELS[deliveryKey] ?? deliveryKey,
        times: blocks.map(blockLabel),
        budgetLabel: budgetLabel(ceiling),
        urgency: row.request?.urgency ? URGENCY_LABELS[row.request.urgency] ?? null : null,
        matchClass: row.match_class,
        askedAt: row.notify_requested_at ?? row.created_at,
        status,
        notifiedAt: row.notified_at ?? null,
        resolvedBy: row.resolved_by ? classNames.get(row.resolved_by) ?? null : null,
      });
    }
  }

  const subjectList: SubjectRank[] = Array.from(subjects.values())
    .map(({ rank, levels: lv, times: tm, ceilings }) => {
      const lvSorted = countTop(lv);
      const tmSorted = countTop(tm);
      return {
        ...rank,
        share: n ? rank.total / n : 0,
        levels: lvSorted.map(([label, count]) => ({ label, count })),
        topLevel: lvSorted[0]?.[0] ?? null,
        topTime: tmSorted[0] ? blockLabel(tmSorted[0][0]) : null,
        recommendedPrice: recommendedPrice(ceilings),
      };
    })
    .sort((a, b) => b.total - a.total || b.unmet - a.unmet || b.optIns - a.optIns);

  const clusterList: Cluster[] = Array.from(clusters.values())
    .map(({ cluster, times: tm, prices, ceilings }) => ({
      ...cluster,
      times: countTop(tm).map(([block, count]) => ({ block, label: blockLabel(block), count })),
      prices: Array.from(prices.values()).sort(
        (a, b) => b.count - a.count || (a.max ?? Infinity) - (b.max ?? Infinity)
      ),
      recommendedPrice: recommendedPrice(ceilings),
    }))
    // Commitment, then unmet volume, then headcount: four families who asked
    // to be told are a better lead than twenty who shrugged.
    .sort((a, b) => b.optIns - a.optIns || b.unmet - a.unmet || b.total - a.total);

  // Subject × time grid, for the ten most-requested subjects.
  const gridBlocks = AVAILABILITY_BLOCKS.map(b => ({ key: b.value as string, label: b.label }));
  const timeGrid = {
    blocks: gridBlocks,
    rows: subjectList.slice(0, 10).map(s => {
      const acc = subjects.get(s.key)!;
      return {
        subject: s.label,
        counts: gridBlocks.map(b => acc.times.get(b.key as AvailabilityBlock) ?? 0),
        total: s.total,
      };
    }),
  };

  const priceList: PriceRank[] = Array.from(priceTally.values())
    .map(p => ({ ...p, share: n ? p.total / n : 0 }))
    .sort((a, b) => b.total - a.total || (a.max ?? Infinity) - (b.max ?? Infinity));

  const pricePoints: PricePoint[] = PRICE_POINTS.map(price => {
    const share = servedShare(allCeilings, price);
    return { price, servesShare: share, servesCount: Math.round(share * allCeilings.length) };
  });

  notifyList.sort((a, b) => b.askedAt.localeCompare(a.askedAt));

  const optIns = rows.filter(r => r.notify_optin).length;
  const noAddress = notifyList.filter(e => e.status === 'no_address').length;

  return {
    totals: {
      signals: n,
      unmet: rows.filter(isUnmet).length,
      optIns,
      optInsReachable: optIns - noAddress,
      optInsNoAddress: noAddress,
      exact: rows.filter(r => r.match_class === 'exact').length,
      near: rows.filter(r => r.match_class === 'near').length,
      fallback: rows.filter(r => r.match_class === 'fallback').length,
      none: rows.filter(r => r.match_class === 'none' || r.match_class === null).length,
      unknownSubject: rows.filter(r => !signalSubjectLabel(r)).length,
      clusters: clusterList.length,
      truncated,
    },
    subjects: subjectList,
    times: times.ranked(),
    timeGrid,
    prices: priceList,
    pricePoints,
    levels: levels.ranked(),
    delivery: delivery.ranked(),
    clusters: clusterList,
    notifyList,
  };
}
