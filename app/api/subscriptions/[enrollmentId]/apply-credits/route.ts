// /api/subscriptions/[enrollmentId]/apply-credits — "Apply credits to my next
// payment" on a Stripe-billed monthly subscription (scenario A).
//
//   POST   { amountTtd? }   attach credits to the next renewal
//   DELETE                  take them off again (before the renewal is prepared)
//
// Only the person who pays for the class can do either: their wallet pays.
// See lib/credits/renewalCredits.ts for the guards.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { applyCreditsToRenewal, removeCreditsFromRenewal } from '@/lib/credits/renewalCredits';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ enrollmentId: string }> };

async function currentUserId(): Promise<string | null> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { enrollmentId } = await params;
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { amountTtd?: unknown };
    const requested = Number(body.amountTtd) > 0 ? Number(body.amountTtd) : null;

    const result = await applyCreditsToRenewal({
      admin: getServiceClient(),
      userId,
      enrollmentId,
      requestedTtd: requested,
    });
    return NextResponse.json(result.body, { status: result.ok ? 200 : result.status });
  } catch (err) {
    console.error('[POST apply-credits]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { enrollmentId } = await params;
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await removeCreditsFromRenewal({ admin: getServiceClient(), enrollmentId, userId });
    return NextResponse.json(result.body, { status: result.ok ? 200 : result.status });
  } catch (err) {
    console.error('[DELETE apply-credits]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
