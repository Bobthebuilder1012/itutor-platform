// POST /api/groups/[groupId]/subscribe
// A student subscribes themself to a MONTHLY group class.
//
// The fourteen-step flow now lives in lib/payments/groupSubscriptionCheckout —
// it is shared with the parent route, which does the same thing with the payer
// and the student being different people. Behaviour here is unchanged: this
// passes studentId === payerId, which is what the code already assumed when it
// used auth.uid() for both.
//
// What stays in the route is the part that is genuinely route-specific: proving
// the caller is who they say they are. A student's proof is their session.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createGroupSubscriptionCheckout } from '@/lib/payments/groupSubscriptionCheckout';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ groupId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;

    // Step 1: Auth — student only
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await createGroupSubscriptionCheckout({
      admin: getServiceClient(),
      groupId,
      studentId: user.id,
      // The student is the payer. Written explicitly rather than defaulted, so
      // the one place the two can differ is visible at both call sites.
      payerId: user.id,
      payerEmail: user.email,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/subscribe]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
