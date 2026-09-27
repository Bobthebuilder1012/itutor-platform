// GET /api/tutor/demand — what families are asking for, in this tutor's subjects.
//
// The supply side of the demand ledger. A teacher who can see "five families
// want CSEC Physics on Saturday mornings and three of them left an email
// address" has a reason to open that class; the same teacher guessing has a
// reason to open nothing. This is the only place that turns recorded demand
// into a decision a tutor can act on themselves, rather than one waiting on
// someone in admin to notice and make a phone call.
//
// ───────────────────────────────────────────────────────────────────────────
// AGGREGATES ONLY. NEVER AN IDENTITY.
//
// demand_signals carries user_id, and this endpoint must never return it, nor
// an email, nor a name, nor anything a tutor could use to contact a family
// directly. RLS on the table is service-role-only precisely so no client can
// read it; this route uses the service client and therefore becomes the one
// place that boundary can be broken by accident. Every field returned below is
// a COUNT or a LABEL, and that is the invariant to check first when changing
// this file.
//
// The families opted in to being told when a class opens, by us, once. They did
// not opt in to being contacted by whichever teacher saw their request.
// ───────────────────────────────────────────────────────────────────────────
//
// SCOPED TO THE TUTOR'S OWN SUBJECTS. Not the whole ledger. A tutor who teaches
// Maths has no use for Spanish demand, and showing them the whole board would
// turn a worklist into noise — and would leak the shape of the entire market to
// anyone who registers as a tutor.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { levelLabel, type CanonicalLevel } from '@/lib/matching/levels';
import { availabilityLabel } from '@/lib/finder/wizard';
import { subjectMatches } from '@/lib/matching/subjects';
import type { AvailabilityBlock } from '@/lib/matching/availability';
import { isFinderEnabled } from '@/lib/featureFlags/finder';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 2000;
const MAX_CLUSTERS = 12;

interface SignalRow {
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

const SELECT_TIERS = [
  `level, availability_blocks, budget_max, delivery_pref, match_class,
   notify_optin, resolved_at, created_at, subject:subjects(name)`,
  `level, availability_blocks, budget_max, match_class,
   notify_optin, resolved_at, created_at, subject:subjects(name)`,
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

const DELIVERY_LABELS: Record<string, string> = {
  online: 'Online',
  in_person: 'In person',
  either: 'Either',
  unspecified: 'Either',
};

export async function GET(_req: NextRequest) {
  if (!isFinderEnabled()) {
    return NextResponse.json({ clusters: [], subjects: [], enabled: false });
  }

  // Identity from the session, never a query parameter: this endpoint decides
  // what a tutor may see based on who they are.
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const service = getServiceClient();

  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if ((profile as { role?: string } | null)?.role !== 'tutor') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // ── The tutor's subjects ─────────────────────────────────────────────────
  // Two sources, because the platform has two: tutor_subjects (the canonical
  // join) and the free-text `subject` on classes they already run. A tutor who
  // never filled in their subject list but teaches three classes should still
  // see their own demand — otherwise the panel is empty for exactly the tutors
  // who are most active.
  const subjectNames = new Set<string>();

  const { data: tutorSubjects } = await service
    .from('tutor_subjects')
    .select('subject:subjects(name)')
    .eq('tutor_id', user.id);

  // The embed is typed as an array by the generated types and returned as an
  // object by PostgREST for a to-one relationship. Both shapes are handled
  // rather than asserted, because guessing wrong here means the panel silently
  // finds no subjects and shows a tutor nothing.
  for (const row of (tutorSubjects ?? []) as unknown as Array<{
    subject: { name: string | null } | Array<{ name: string | null }> | null;
  }>) {
    const embedded = Array.isArray(row.subject) ? row.subject : row.subject ? [row.subject] : [];
    for (const entry of embedded) {
      const name = entry?.name?.trim();
      if (name) subjectNames.add(name);
    }
  }

  const { data: ownGroups } = await service
    .from('groups')
    .select('subject')
    .eq('tutor_id', user.id)
    .is('archived_at', null);

  for (const row of (ownGroups ?? []) as Array<{ subject: string | null }>) {
    const name = row.subject?.trim();
    if (name) subjectNames.add(name);
  }

  if (subjectNames.size === 0) {
    return NextResponse.json({ clusters: [], subjects: [], enabled: true });
  }

  // ── The ledger ───────────────────────────────────────────────────────────
  // Unresolved only. A resolved signal is demand somebody already served, and
  // showing it to a tutor as an opportunity would be an invitation to open a
  // class into competition that already exists.
  let rows: SignalRow[] | null = null;

  for (const columns of SELECT_TIERS) {
    const { data, error } = await service
      .from('demand_signals')
      .select(columns)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);

    if (!error) {
      rows = (data ?? []) as unknown as SignalRow[];
      break;
    }
    if (!isSchemaMismatch(error)) {
      console.error('[tutor/demand] read failed:', error.message);
      return NextResponse.json({ clusters: [], subjects: [], enabled: true });
    }
  }

  if (rows === null) {
    // Migration 240 not applied here. Not an error the tutor should see.
    return NextResponse.json({ clusters: [], subjects: [], enabled: true });
  }

  const names = Array.from(subjectNames);

  // Matched through subjectMatches, the same whole-word containment the matcher
  // uses — not string equality. A tutor listed under "Mathematics" must see
  // demand recorded against "CSEC Mathematics", or the panel says zero while
  // the demand map says four.
  const mine = rows.filter(row => subjectMatches(row.subject?.name ?? null, names));

  interface Cluster {
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
  }

  const byKey = new Map<string, Cluster>();
  const blockCounts = new Map<string, Map<string, number>>();

  for (const row of mine) {
    const subject = row.subject?.name ?? 'Unknown subject';
    const level = row.level ?? null;
    const delivery = row.delivery_pref ?? 'unspecified';
    const key = `${subject.toLowerCase()}||${level ?? 'any'}||${delivery}`;

    let cluster = byKey.get(key);
    if (!cluster) {
      cluster = {
        key,
        subject,
        levelLabel: level ? levelLabel(level as CanonicalLevel) : 'Any year',
        deliveryLabel: DELIVERY_LABELS[delivery] ?? 'Either',
        families: 0,
        optIns: 0,
        unserved: 0,
        topBlocks: [],
        lowestBudgetCeiling: null,
        lastAskedAt: row.created_at,
      };
      byKey.set(key, cluster);
      blockCounts.set(key, new Map());
    }

    cluster.families += 1;
    if (row.notify_optin) cluster.optIns += 1;
    // `none` and `fallback` both mean we did not have what they asked for.
    if (row.match_class === 'none' || row.match_class === 'fallback' || row.match_class === null) {
      cluster.unserved += 1;
    }

    const budget = toNumber(row.budget_max);
    if (budget !== null) {
      cluster.lowestBudgetCeiling =
        cluster.lowestBudgetCeiling === null
          ? budget
          : Math.min(cluster.lowestBudgetCeiling, budget);
    }

    if (row.created_at > cluster.lastAskedAt) cluster.lastAskedAt = row.created_at;

    const blocks = blockCounts.get(key)!;
    for (const block of row.availability_blocks ?? []) {
      blocks.set(block, (blocks.get(block) ?? 0) + 1);
    }
  }

  const clusters = Array.from(byKey.values())
    .map(cluster => ({
      ...cluster,
      topBlocks: Array.from(blockCounts.get(cluster.key)!.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([block, count]) => ({
          label: availabilityLabel(block as AvailabilityBlock),
          count,
        })),
    }))
    // Opt-ins first: a family who left an email address is a family who will
    // turn up. Then unserved volume, then recency.
    .sort(
      (a, b) =>
        b.optIns - a.optIns ||
        b.unserved - a.unserved ||
        b.families - a.families ||
        b.lastAskedAt.localeCompare(a.lastAskedAt)
    )
    .slice(0, MAX_CLUSTERS);

  return NextResponse.json({
    clusters,
    subjects: names,
    enabled: true,
    totalFamilies: mine.length,
  });
}
