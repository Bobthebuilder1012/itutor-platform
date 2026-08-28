/**
 * The credit meter's data.
 *
 * Rule 2: the balance is derived, never stored. `ai_credit_balance()` sums the
 * ledger's deltas, so a refund is visible the moment the worker writes it and
 * there is no counter anywhere that can drift away from the truth.
 *
 * This route grants the month's credits if they have not been granted yet, so
 * reading the meter is what enrols a tutor rather than a scheduled job that has
 * to walk the whole user table. See lib/services/aiCreditService.ts.
 */
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { ensureMonthlyGrant, getBalance, getEntitlement } from '@/lib/services/aiCreditService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureMonthlyGrant(user.id);

    const [balance, entitlement] = await Promise.all([getBalance(user.id), getEntitlement()]);

    return NextResponse.json({
      remaining: balance,
      monthly: entitlement.monthlyCredits,
      rateLimitPerHour: entitlement.rateLimitPerHour,
      maxPagesPerJob: entitlement.maxPagesPerJob,
    });
  } catch (error) {
    console.error('[ai/credits] failed:', error);
    return NextResponse.json({ error: 'Could not read your balance' }, { status: 500 });
  }
}
