// /api/admin/credits/report — what the credit programme has cost and who is
// earning from it. Feeds /admin/referrals and the accountant's view.
//
//   totals     granted / spent / reserved / outstanding / clawed back / expired,
//              split by source (referral, campaign code, admin). "Spent" is net
//              of refunds: a restored spend is taken off it.
//   referrers  everyone with a referral, converted count against the flag
//              threshold; flagged ones carry their friends, payers and card
//              fingerprints for review
//   rejected   the latest referrals the checks refused, with the reason
//   review     money that needs a human: clawback shortfalls, spends committed
//              after release, and renewals held for a credit mismatch

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server';
import { requireCreditAdmin } from '@/lib/credits/adminAccess';
import { getCreditSettings } from '@/lib/credits/settings';
import { isMissingSchema } from '@/lib/supabase/schemaErrors';
import type { CreditAllocation, CreditSource } from '@/lib/credits/types';

export const dynamic = 'force-dynamic';

const PAGE = 1000;
const SOURCES: CreditSource[] = ['referral', 'campaign_code', 'admin'];

type Totals = {
  granted: number;
  spent: number;
  reserved: number;
  outstanding: number;
  pending: number;
  clawed_back: number;
  expired: number;
  removed: number;
};

const emptyTotals = (): Totals => ({
  granted: 0, spent: 0, reserved: 0, outstanding: 0, pending: 0, clawed_back: 0, expired: 0, removed: 0,
});

const round2 = (n: number) => Math.round(n * 100) / 100;

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>
): Promise<{ rows: T[]; error: { message: string; code?: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows, error: null };
  }
}

interface LedgerRow {
  id: string;
  user_id: string;
  kind: string;
  amount_ttd: number | string;
  state: string;
  source: CreditSource | null;
  remaining_ttd: number | string | null;
  expires_at: string | null;
  allocations: CreditAllocation[] | null;
  related_id: string | null;
  shortfall_ttd: number | string;
  note: string | null;
  created_at: string;
  subscription_payment_id: string | null;
}

async function profileNames(service: SupabaseClient, ids: string[]) {
  const map = new Map<string, { name: string; email: string | null; is_suspended: boolean; role: string | null }>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await service
      .from('profiles')
      .select('id, full_name, display_name, email, is_suspended, role')
      .in('id', unique.slice(i, i + 200));
    for (const p of data ?? []) {
      map.set(p.id, {
        name: p.full_name || p.display_name || p.email || 'Unknown',
        email: p.email ?? null,
        is_suspended: p.is_suspended === true,
        role: p.role ?? null,
      });
    }
  }
  return map;
}

export async function GET() {
  const { error: authErr } = await requireCreditAdmin();
  if (authErr) return authErr;

  const service = getServiceClient();
  const settings = await getCreditSettings(service, { fresh: true });
  if (!settings) return NextResponse.json({ unavailable: true });

  const ledger = await fetchAll<LedgerRow>((from, to) =>
    service
      .from('credit_ledger')
      .select('id, user_id, kind, amount_ttd, state, source, remaining_ttd, expires_at, allocations, related_id, shortfall_ttd, note, created_at, subscription_payment_id')
      .order('created_at', { ascending: true })
      .range(from, to)
  );
  if (ledger.error) {
    if (isMissingSchema(ledger.error)) return NextResponse.json({ unavailable: true });
    console.error('[admin/credits/report] ledger read failed:', ledger.error.message);
    return NextResponse.json({ error: 'Could not load the credit ledger' }, { status: 500 });
  }

  // ── Totals by source ──────────────────────────────────────────────────
  const grantSource = new Map<string, CreditSource>();
  for (const row of ledger.rows) if (row.kind === 'grant' && row.source) grantSource.set(row.id, row.source);

  const bySource: Record<CreditSource, Totals> = {
    referral: emptyTotals(),
    campaign_code: emptyTotals(),
    admin: emptyTotals(),
  };
  const now = Date.now();
  const addAllocations = (allocs: CreditAllocation[] | null, field: keyof Totals, sign = 1) => {
    for (const a of allocs ?? []) {
      const src = grantSource.get(a.grant_id);
      if (src) bySource[src][field] += sign * Number(a.amount);
    }
  };

  for (const row of ledger.rows) {
    const amount = Number(row.amount_ttd);
    switch (row.kind) {
      case 'grant': {
        if (!row.source) break;
        const t = bySource[row.source];
        t.granted += amount;
        const remaining = Number(row.remaining_ttd ?? 0);
        const live = !row.expires_at || new Date(row.expires_at).getTime() > now;
        if (row.state === 'available' && live) t.outstanding += remaining;
        if (row.state === 'pending') t.pending += remaining;
        break;
      }
      case 'spend':
        if (row.state === 'reserved') addAllocations(row.allocations, 'reserved');
        if (row.state === 'settled') addAllocations(row.allocations, 'spent');
        break;
      case 'restore':
        addAllocations(row.allocations, 'spent', -1);
        break;
      case 'adjustment':
        addAllocations(row.allocations, 'removed');
        break;
      case 'clawback': {
        const src = row.related_id ? grantSource.get(row.related_id) : undefined;
        if (src) bySource[src].clawed_back += -amount;
        break;
      }
      case 'expiry': {
        const src = row.related_id ? grantSource.get(row.related_id) : undefined;
        if (src) bySource[src].expired += -amount;
        break;
      }
    }
  }
  for (const src of SOURCES) {
    const t = bySource[src];
    (Object.keys(t) as (keyof Totals)[]).forEach((k) => (t[k] = round2(t[k])));
  }
  const all = emptyTotals();
  for (const src of SOURCES) {
    (Object.keys(all) as (keyof Totals)[]).forEach((k) => (all[k] = round2(all[k] + bySource[src][k])));
  }

  // ── Referrals ────────────────────────────────────────────────────────
  const referrals = await fetchAll<{
    id: string;
    referrer_id: string;
    referee_id: string;
    status: string;
    is_sibling_referral: boolean;
    cash_paid_ttd: number | string | null;
    payer_id: string | null;
    payer_fingerprint: string | null;
    rejected_reason: string | null;
    converted_at: string | null;
    rejected_at: string | null;
    grant_id: string | null;
    created_at: string;
  }>((from, to) =>
    service
      .from('referrals')
      .select('id, referrer_id, referee_id, status, is_sibling_referral, cash_paid_ttd, payer_id, payer_fingerprint, rejected_reason, converted_at, rejected_at, grant_id, created_at')
      .order('created_at', { ascending: true })
      .range(from, to)
  );
  if (referrals.error) {
    console.error('[admin/credits/report] referrals read failed:', referrals.error.message);
    return NextResponse.json({ error: 'Could not load referrals' }, { status: 500 });
  }

  const { data: mismatches } = await service
    .from('subscription_payment_exceptions')
    .select('id, subscription_payment_id, student_id, error_message, created_at, status')
    .eq('exception_type', 'credit_mismatch')
    .in('status', ['open', 'in_review'])
    .order('created_at', { ascending: false })
    .limit(100);

  const people = await profileNames(service, [
    ...referrals.rows.flatMap((r) => [r.referrer_id, r.referee_id, r.payer_id ?? '']),
    ...ledger.rows.filter((r) => Number(r.shortfall_ttd) > 0).map((r) => r.user_id),
    ...(mismatches ?? []).map((m) => m.student_id ?? ''),
  ]);
  const who = (id: string | null) => (id ? people.get(id) : undefined);

  const byReferrer = new Map<string, typeof referrals.rows>();
  for (const r of referrals.rows) {
    const list = byReferrer.get(r.referrer_id) ?? [];
    list.push(r);
    byReferrer.set(r.referrer_id, list);
  }

  const referrers = Array.from(byReferrer.entries())
    .map(([referrerId, list]) => {
      const converted = list.filter((r) => r.status === 'converted').length;
      const flagged = converted >= settings.flag_conversions_threshold;
      const person = who(referrerId);
      return {
        user_id: referrerId,
        name: person?.name ?? 'Unknown',
        email: person?.email ?? null,
        is_suspended: person?.is_suspended ?? false,
        signed_up: list.length,
        converted,
        rejected: list.filter((r) => r.status === 'rejected').length,
        rewards: new Set(list.map((r) => r.grant_id).filter(Boolean)).size,
        flagged,
        friends: flagged
          ? list.map((r) => ({
              referral_id: r.id,
              name: who(r.referee_id)?.name ?? 'Unknown',
              status: r.status,
              sibling: r.is_sibling_referral,
              payer: r.payer_id ? who(r.payer_id)?.name ?? 'Unknown' : null,
              fingerprint: r.payer_fingerprint,
              cash_paid_ttd: r.cash_paid_ttd === null ? null : Number(r.cash_paid_ttd),
              converted_at: r.converted_at,
              rejected_reason: r.rejected_reason,
            }))
          : undefined,
      };
    })
    .sort((a, b) => b.converted - a.converted || b.signed_up - a.signed_up);

  const rejected = referrals.rows
    .filter((r) => r.status === 'rejected')
    .sort((a, b) => (b.rejected_at ?? '').localeCompare(a.rejected_at ?? ''))
    .slice(0, 100)
    .map((r) => ({
      referral_id: r.id,
      referrer: who(r.referrer_id)?.name ?? 'Unknown',
      friend: who(r.referee_id)?.name ?? 'Unknown',
      reason: r.rejected_reason,
      at: r.rejected_at,
    }));

  // ── Needs review ─────────────────────────────────────────────────────
  const review: Array<{
    kind: string;
    user: string;
    user_id: string;
    amount_ttd: number;
    note: string | null;
    at: string;
    subscription_payment_id: string | null;
  }> = ledger.rows
    .filter((r) => Number(r.shortfall_ttd) > 0)
    .map((r) => ({
      kind: r.kind === 'clawback' ? 'Clawback shortfall (credits already spent)' : 'Spend committed after release',
      user: who(r.user_id)?.name ?? 'Unknown',
      user_id: r.user_id,
      amount_ttd: Number(r.shortfall_ttd),
      note: r.note,
      at: r.created_at,
      subscription_payment_id: r.subscription_payment_id,
    }));

  for (const m of mismatches ?? []) {
    review.push({
      kind: 'Payment held: credit mismatch',
      user: m.student_id ? who(m.student_id)?.name ?? m.student_id : 'Unknown',
      user_id: m.student_id ?? '',
      amount_ttd: 0,
      note: m.error_message,
      at: m.created_at,
      subscription_payment_id: m.subscription_payment_id,
    });
  }
  review.sort((a, b) => b.at.localeCompare(a.at));

  return NextResponse.json({
    settings,
    totals: { all, bySource },
    referrers,
    rejected,
    review,
  });
}
