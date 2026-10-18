// GET /api/credits/quote?groupId=…
// Can the caller's credits pay for one month of this class? Credits pay a
// month in full or not at all, so the answer is yes, or how much more is
// needed. For the "Pay with credits" option on the class page.
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
  const quote = quoteCredits({ scenario: 'B', baseTtd: base, balanceTtd: wallet?.available ?? 0 });

  return NextResponse.json({
    available: true,
    balance: wallet?.available ?? 0,
    pending: wallet?.pending ?? 0,
    quote,
  });
}
