import type { SupabaseClient } from '@supabase/supabase-js';
import { isSaneRate } from './rates';

/**
 * Upsert the day's TTD/USD rate, then fill any USD ledger rows that were
 * written before a rate existed for their payment date. Service client only.
 */
export async function storeRate(
  admin: SupabaseClient,
  rateDate: string,
  ttdPerUsd: number,
  source: 'cbtt' | 'manual',
  publishedDate: string | null,
): Promise<{ restamped: number }> {
  if (!isSaneRate(ttdPerUsd)) throw new Error(`rate_out_of_range: ${ttdPerUsd}`);

  const { error } = await admin.from('fx_rates').upsert(
    {
      rate_date: rateDate,
      base: 'TTD',
      quote: 'USD',
      ttd_per_usd: Math.round(ttdPerUsd * 10000) / 10000,
      source,
      published_date: publishedDate,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'rate_date,base,quote' },
  );
  if (error) throw new Error(`fx_rates upsert: ${error.message}`);

  const { data, error: rpcErr } = await admin.rpc('restamp_missing_usd_amounts');
  if (rpcErr) throw new Error(`restamp: ${rpcErr.message}`);
  return { restamped: Number(data ?? 0) };
}
