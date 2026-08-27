/**
 * The credit meter's data.
 *
 * Rule 2: the balance is derived, never stored. `ai_credit_balance()` sums the
 * ledger's deltas, so a refund is visible the moment the worker writes it and
 * there is no counter anywhere that can drift away from the truth.
 */
import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Matches the seeded row in 251 until paid tiers exist. */
const DEFAULT_TIER = 'FREE';

export async function GET() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = getServiceClient();

  const [{ data: balance, error: balanceError }, { data: entitlement }] = await Promise.all([
    service.rpc('ai_credit_balance', { p_user_id: user.id }),
    service
      .from('ai_entitlements')
      .select('monthly_credits, rate_limit_per_hour, max_pages_per_job')
      .eq('tier', DEFAULT_TIER)
      .eq('feature', 'ALL')
      .maybeSingle(),
  ]);

  if (balanceError) {
    console.error('[ai/credits] balance failed:', balanceError.message);
    return NextResponse.json({ error: 'Could not read your balance' }, { status: 500 });
  }

  const monthly = entitlement?.monthly_credits ?? 0;

  // A tutor who has never been granted anything reads as a full allowance
  // rather than as zero. The monthly grant is a scheduled job that does not
  // exist yet, and showing "0 of 40" to someone who has spent nothing would be
  // wrong in the direction that stops them using the feature.
  const spent = typeof balance === 'number' ? balance : 0;
  const remaining = spent === 0 ? monthly : Math.max(0, spent);

  return NextResponse.json({
    remaining,
    monthly,
    rateLimitPerHour: entitlement?.rate_limit_per_hour ?? 0,
    maxPagesPerJob: entitlement?.max_pages_per_job ?? 0,
  });
}
