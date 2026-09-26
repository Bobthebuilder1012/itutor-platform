// =====================================================
// CRON: DAILY CBTT TTD/USD RATE
// =====================================================
// GET /api/cron/fetch-fx-rate
// Headers: Authorization: Bearer <CRON_SECRET>
//
// Runs twice daily (see vercel.json) so one missed fetch still leaves a
// rate for the day. Stores today's (Port of Spain) CBTT selling rate in
// fx_rates, then restamps any USD payout_ledger rows that were written
// before a rate existed for their payment date.
//
// A parse failure answers 500 rather than storing a guess. The fallback is
// POST /api/admin/fx-rate with the figure off the CBTT site.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { fetchCbttUsdRate } from '@/lib/fx/cbtt';
import { portOfSpainDate } from '@/lib/fx/rates';
import { storeRate } from '@/lib/fx/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getServiceClient();
  const rateDate = portOfSpainDate();

  // A manual override for today wins over the scraper.
  const { data: existing } = await admin
    .from('fx_rates')
    .select('source, ttd_per_usd')
    .eq('rate_date', rateDate)
    .eq('base', 'TTD')
    .eq('quote', 'USD')
    .maybeSingle();
  if (existing?.source === 'manual') {
    const { data: restamped } = await admin.rpc('restamp_missing_usd_amounts');
    return NextResponse.json({ ok: true, skipped: 'manual rate already set', rate: existing, restamped });
  }

  try {
    const cbtt = await fetchCbttUsdRate();
    const { restamped } = await storeRate(admin, rateDate, cbtt.ttdPerUsd, 'cbtt', cbtt.publishedDate);
    return NextResponse.json({ ok: true, rate_date: rateDate, ttd_per_usd: cbtt.ttdPerUsd, restamped });
  } catch (err: any) {
    console.error('[cron/fetch-fx-rate] failed:', err);
    return NextResponse.json({ error: 'FX rate fetch failed', details: err?.message }, { status: 500 });
  }
}
