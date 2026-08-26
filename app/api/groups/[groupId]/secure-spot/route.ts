// POST /api/groups/[groupId]/secure-spot
//
// A student reserves their own place in a class that has not started yet, by
// paying the first month up front.
//
// The checkout itself lives in lib/payments/secureSpotCheckout so the parent's
// route can create the identical reservation with the parent's card — the seat
// claim, capacity lock, fee arithmetic, free-class shortcut and Stripe intent
// are shared by construction rather than by review. What stays here is what is
// genuinely student-specific: who is signed in, and the parent's gate.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createSecureSpotCheckout } from '@/lib/payments/secureSpotCheckout';
import { createClassJoinRequest, resolveClassJoinGate } from '@/lib/server/classJoinRequests';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    // THE PARENT'S GATE, BEFORE ANY MONEY MOVES.
    //
    // A child whose parent set "ask for approval first" must not reach a card
    // form. The UI already offers them "Ask parent to enrol" instead of this
    // flow, but the button is not the control — a direct POST would otherwise
    // walk a dependent child all the way to a Stripe checkout, and a seat claim
    // would be held against a payment they were never allowed to make.
    //
    // Above the checkout so nothing is reserved: the request holds no place,
    // and neither should the refusal.
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

    const result = await createSecureSpotCheckout({
      admin,
      groupId,
      studentId: user.id,
      // The student is the payer. Written explicitly rather than defaulted, so
      // the one place the two can differ is visible at both call sites.
      payerId: user.id,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/secure-spot]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
