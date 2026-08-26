// POST /api/parent/enroll-child/secure-spot
// A parent reserves a linked child's place in a class that has not started yet.
//
// The preorder sibling of enroll-child/subscribe, and it did not exist. Every
// priced class on /parent/classes went to the MONTHLY subscription checkout,
// including classes that had not started — so a parent buying a preorder class
// was sold a recurring subscription where the student buying the same class
// gets a one-time charge held until the first month has been taught. Two
// different products, one button.
//
// It also could not succeed at all once the child had opened a secure-spot hold
// of their own: that hold is a group_enrollments row with status
// SECURED_PENDING_PAYMENT, which the subscription checkout does not look for,
// so it tried to insert a second row and collided with the unique index over
// (student_id, group_id) — surfacing as "Failed to create enrollment". The
// claim RPC, by contrast, resumes the student's own hold (migration 214).
//
// The child attends; the parent's card is charged. Authorization is proven here
// with requireParentChild, never passed in as a flag.

import { NextRequest, NextResponse } from 'next/server';
import {
  ParentAccessError,
  requireParentContext,
  requireParentChild,
} from '@/lib/server/parentAccess';
import { createSecureSpotCheckout } from '@/lib/payments/secureSpotCheckout';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const body = (await request.json().catch(() => ({}))) as {
      childId?: string;
      groupId?: string;
    };
    const { childId, groupId } = body;
    if (!childId || !groupId) {
      return NextResponse.json({ error: 'Missing childId or groupId' }, { status: 400 });
    }

    // 404s if this is not the parent's child. Everything below spends money on
    // that child's behalf, so it is the first thing established.
    await requireParentChild(parentProfile.id, childId);

    const result = await createSecureSpotCheckout({
      admin,
      groupId,
      // The child is in the class; the parent's card pays for it.
      studentId: childId,
      payerId: parentProfile.id,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof ParentAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/parent/enroll-child/secure-spot]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
