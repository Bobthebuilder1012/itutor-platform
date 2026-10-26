// GET /api/credits/quote?groupId=…&scenario=B|C[&amount=…]
// What credits would do for a purchase, before it starts — for the "Use
// credits" controls on the class page.
//
//   B  one month with credits: exact (no promotions apply to it)
//   C  first month of a subscription: an ESTIMATE on the class's list price.
//      The checkout re-quotes against the promotion it actually applies, and
//      the checkout page shows the exact figures before anything is charged.
//
// Always the caller's own wallet: a parent buying for a child spends their own.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getCreditSettings } from '@/lib/credits/settings';
import { creditAccountGuard } from '@/lib/credits/guard';
import { getWallet } from '@/lib/credits/wallet';
import { quoteCredits } from '@/lib/credits/quote';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const groupId = req.nextUrl.searchParams.get('groupId');
  const scenario = req.nextUrl.searchParams.get('scenario') === 'C' ? 'C' : 'B';
  const amount = Number(req.nextUrl.searchParams.get('amount'));
  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 });

  const admin = getServiceClient();
  const settings = await getCreditSettings(admin);
  if (!settings) return NextResponse.json({ available: false });

  const guard = await creditAccountGuard(admin, user.id);
  if (!guard.ok) return NextResponse.json({ available: false, reason: guard.body.reason ?? null });

  const { data: group } = await admin
    .from('groups')
    .select('id, price_monthly')
    .eq('id', groupId)
    .maybeSingle();
  const base = Number(group?.price_monthly ?? 0);
  if (!group || !(base > 0)) return NextResponse.json({ available: false, reason: 'not_paid_class' });

  const wallet = await getWallet(admin, user.id);
  const quote = quoteCredits({
    scenario,
    baseTtd: base,
    balanceTtd: wallet?.available ?? 0,
    requestedTtd: amount > 0 ? amount : null,
    minCashChargeTtd: settings.min_cash_charge_ttd,
  });

  return NextResponse.json({
    available: true,
    estimate: scenario === 'C',
    balance: wallet?.available ?? 0,
    pending: wallet?.pending ?? 0,
    quote,
  });
}
