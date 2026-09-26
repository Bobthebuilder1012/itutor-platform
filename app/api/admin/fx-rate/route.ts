// =====================================================
// ADMIN: TTD/USD RATE
// =====================================================
// GET  /api/admin/fx-rate  → the last 30 stored rates
// POST /api/admin/fx-rate  { rate_date?, ttd_per_usd }
//        Manual entry of the CBTT selling rate (the fallback when the
//        scraper fails). Marked source='manual', which the cron will not
//        overwrite. Restamps USD ledger rows that were waiting on a rate.
//        Note: rows ALREADY stamped are frozen and are not re-priced.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { isSaneRate, portOfSpainDate, SANE_RATE_MAX, SANE_RATE_MIN } from '@/lib/fx/rates';
import { storeRate } from '@/lib/fx/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { data, error } = await getServiceClient()
    .from('fx_rates')
    .select('rate_date, ttd_per_usd, source, published_date, fetched_at')
    .order('rate_date', { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rates: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const rate = Number(body.ttd_per_usd);
  const rateDate = typeof body.rate_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.rate_date)
    ? body.rate_date
    : portOfSpainDate();

  if (!isSaneRate(rate)) {
    return NextResponse.json(
      { error: `ttd_per_usd must be between ${SANE_RATE_MIN} and ${SANE_RATE_MAX}` },
      { status: 400 },
    );
  }

  try {
    const { restamped } = await storeRate(getServiceClient(), rateDate, rate, 'manual', rateDate);
    return NextResponse.json({ ok: true, rate_date: rateDate, ttd_per_usd: rate, restamped });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
