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
import { createClassJoinRequest, resolveClassJoinGate } from '@/lib/server/classJoinRequests';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ groupId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;

    // Only 'physical' is meaningful; anything else is online, which is what an
    // online-only class can offer and what every seat was before migration 242.
    // A body is optional, so a client that sends none still enrols online.
    const body = (await req.json().catch(() => ({}))) as { seatType?: string };
    const seatTypeFromBody = body.seatType === 'physical' ? 'physical' : 'online';

    // Step 1: Auth — student only
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // The parent's gate, before any Stripe object exists — the same check and
    // the same reason as the secure-spot route. A dependent child cannot start
    // a subscription for themselves; they ask, and the parent enrols them from
    // the class page, which charges the parent's card rather than the child's.
    const admin = getServiceClient();
    const gate = await resolveClassJoinGate(admin, user.id);
    if (gate.needsParentApproval) {
      const request = await createClassJoinRequest(admin, {
        groupId,
        studentId: user.id,
        parentId: gate.parentId,
      });
      return NextResponse.json(
        {
          parent_approval_required: true,
          request_id: request.ok ? request.requestId : null,
          already_pending: request.ok ? request.alreadyPending : false,
          error: 'Your parent needs to approve this before you can join.',
        },
        { status: 202 }
      );
    }

    const result = await createGroupSubscriptionCheckout({
      admin,
      groupId,
      studentId: user.id,
      // The student is the payer. Written explicitly rather than defaulted, so
      // the one place the two can differ is visible at both call sites.
      payerId: user.id,
      payerEmail: user.email,
      // Which kind of seat, for a hybrid class. Read from the body and validated
      // downstream against what the class actually offers, so an unknown or
      // absent value becomes 'online' rather than a rejection.
      seatType: seatTypeFromBody,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/subscribe]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
