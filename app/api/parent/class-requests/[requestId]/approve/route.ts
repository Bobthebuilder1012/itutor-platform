// POST /api/parent/class-requests/[requestId]/approve
//
// The parent says yes. For a free class that IS the enrolment; for a class the
// tutor gates, it moves the child into the tutor's queue and says so. Ownership
// of the request is proven inside approveClassJoinRequest by matching parent_id,
// not by trusting the caller.
//
// A paid class does not reach here — a dependent child cannot start a paid
// subscription for themselves, so there is no request to approve; the parent
// enrols them from /parent/classes, which takes payment in the same step.

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
      return NextResponse.json({ error: messageFor(result.reason) }, { status });
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
