// POST /api/parent/class-requests/[requestId]/approve
//
// The parent says yes. For a free class that IS the enrolment; for a class the
// tutor gates, it moves the child into the tutor's queue and says so. Ownership
// of the request is proven inside approveClassJoinRequest by matching parent_id,
// not by trusting the caller.
//
// A PAID class reaches here but is never approved into a seat. approveClass-
// JoinRequest writes a roster row and takes no payment, so a priced class comes
// back as payment_required with its groupId, and the parent finishes on
// /parent/classes — which enrols and charges in the same step. The request
// settles itself once that seat exists.
//
// Children CAN now raise requests for paid classes: the marketplace offers them
// "Ask parent to enrol" in place of the checkout they are not allowed to reach.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { approveClassJoinRequest } from '@/lib/server/classJoinRequests';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ requestId: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { requestId } = await params;
    const { admin, parentProfile } = await requireParentContext();

    const result = await approveClassJoinRequest(admin, {
      requestId,
      parentId: parentProfile.id,
    });

    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 409;
      // reason and groupId travel with the refusal so the page can act on the
      // one case that is not really a failure: a priced class, where approving
      // and paying are the same step and both happen on the class page.
      return NextResponse.json(
        { error: messageFor(result.reason), reason: result.reason, groupId: result.groupId ?? null },
        { status }
      );
    }

    return NextResponse.json({ success: true, awaitingTutor: result.awaitingTutor ?? false });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/class-requests/[requestId]/approve]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function messageFor(reason?: string): string {
  switch (reason) {
    case 'not_found':
      return 'That request is not on your account.';
    case 'already_decided':
      return 'That request has already been answered.';
    case 'class_unavailable':
      return 'That class is no longer available.';
    default:
      return 'Could not approve this request.';
  }
}
