// =====================================================
// TTD ⇄ USD rates (CBTT daily selling rate)
// =====================================================
// Rates live in public.fx_rates, written only by /api/cron/fetch-fx-rate
// and the admin override. A payout's USD value is FROZEN on its
// payout_ledger row at the rate for the day the student paid; nothing here
// re-prices history. These helpers exist for display of current figures
// (today's rate, "≈ US$" previews).

import type { SupabaseClient } from '@supabase/supabase-js';

export interface FxRate {
  rate_date: string;
  ttd_per_usd: number;
  published_date: string | null;
}

/** Port of Spain calendar date (YYYY-MM-DD) for an instant. */
export function portOfSpainDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Port_of_Spain',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

/** Newest rate on or before `date` (defaults to today in Port of Spain). */
export async function getRate(
  client: SupabaseClient,
  date: string = portOfSpainDate(),
): Promise<FxRate | null> {
  const { data, error } = await client
    .from('fx_rates')
    .select('rate_date, ttd_per_usd, published_date')
    .eq('base', 'TTD')
    .eq('quote', 'USD')
    .lte('rate_date', date)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data, ttd_per_usd: Number(data.ttd_per_usd) } as FxRate;
}

/** Same rounding as the payout_ledger trigger: round(ttd / rate, 2). */
export function ttdToUsd(ttd: number, ttdPerUsd: number): number {
  return Math.round((ttd / ttdPerUsd) * 100) / 100;
}

/** A TTD/USD rate outside this band is treated as a parse failure. */
export const SANE_RATE_MIN = 6.0;
export const SANE_RATE_MAX = 7.5;

export function isSaneRate(r: number): boolean {
  return Number.isFinite(r) && r >= SANE_RATE_MIN && r <= SANE_RATE_MAX;
}
