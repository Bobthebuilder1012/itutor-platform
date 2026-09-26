// =====================================================
// TUTOR PAYOUT CURRENCY
// =====================================================
// GET  /api/tutor/payout-currency
//        → { enabled, currency, changed_at, rate }  (rate = today's CBTT)
// POST /api/tutor/payout-currency  { currency: 'TTD' | 'USD' }
//
// The election is stored on tutor_payout_accounts and copied onto each
// payout_ledger row when it is written (migration 260). Switching applies
// to NEW earnings only. Limited to one change per 7 days so a tutor cannot
// flip back and forth inside a payout cycle.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { isUsdPayoutsEnabled, USD_PAYOUTS_DISABLED_MESSAGE } from '@/lib/featureFlags/usdPayouts';
import { getRate } from '@/lib/fx/rates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

async function requireTutor() {
  const userClient = await getServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'tutor') {
    return { error: 'Forbidden', status: 403 as const };
  }
  return { user };
}

export async function GET() {
  const auth = await requireTutor();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getServiceClient();
  const [{ data: account }, rate] = await Promise.all([
    admin
      .from('tutor_payout_accounts')
      .select('payout_currency, payout_currency_changed_at')
      .eq('tutor_id', auth.user.id)
      .maybeSingle(),
    getRate(admin),
  ]);

  return NextResponse.json({
    enabled: isUsdPayoutsEnabled(),
    has_account: !!account,
    currency: (account?.payout_currency as 'TTD' | 'USD' | undefined) ?? 'TTD',
    changed_at: account?.payout_currency_changed_at ?? null,
    rate,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireTutor();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const currency = body.currency;
  if (currency !== 'TTD' && currency !== 'USD') {
    return NextResponse.json({ error: 'currency must be "TTD" or "USD"' }, { status: 400 });
  }
  // Switching back to TTD is always allowed; opting in needs the flag.
  if (currency === 'USD' && !isUsdPayoutsEnabled()) {
    return NextResponse.json({ error: USD_PAYOUTS_DISABLED_MESSAGE }, { status: 403 });
  }

  const admin = getServiceClient();
  const { data: account, error: readErr } = await admin
    .from('tutor_payout_accounts')
    .select('payout_currency, payout_currency_changed_at')
    .eq('tutor_id', auth.user.id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!account) {
    return NextResponse.json({ error: 'Add your bank details before choosing a payout currency.' }, { status: 400 });
  }
  if (account.payout_currency === currency) {
    return NextResponse.json({ ok: true, currency, unchanged: true });
  }

  const last = account.payout_currency_changed_at ? Date.parse(account.payout_currency_changed_at) : 0;
  if (last && Date.now() - last < CHANGE_COOLDOWN_MS) {
    const next = new Date(last + CHANGE_COOLDOWN_MS).toISOString();
    return NextResponse.json(
      { error: 'You can change your payout currency once every 7 days.', next_change_at: next },
      { status: 429 },
    );
  }

  if (currency === 'USD' && !(await getRate(admin))) {
    return NextResponse.json({ error: 'No exchange rate is available yet. Try again later.' }, { status: 503 });
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from('tutor_payout_accounts')
    .update({ payout_currency: currency, payout_currency_changed_at: now, updated_at: now })
    .eq('tutor_id', auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, currency, changed_at: now });
}
