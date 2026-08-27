// POST /api/parent/enroll-child/subscribe
// A parent pays for a linked child's place in a MONTHLY group class.
//
// The child attends; the parent's card is charged. That is the only difference
// from the student route — both call the same fourteen-step checkout, so the
// seat reservation, capacity arithmetic, waitlist, promotions and cancel_at
// rounding are identical by construction rather than by review.
//
// WHY THE CHILD IS THE STUDENT AND NOT THE CUSTOMER
// The enrolment, the schedule-conflict check, the attendance record and the
// class roster all key on the child — they are the person in the class. Only the
// Stripe customer is the parent. Getting this backwards would put the parent on
// the roster and charge nobody's card twice over.
//
// AUTHORIZATION IS PROVEN HERE, NOT PASSED IN
// requireParentChild is the whole basis for spending on another person's behalf.
// The shared checkout deliberately does not accept an "authorized" flag: a flag
// can be forgotten, a proof cannot.

import { NextRequest, NextResponse } from 'next/server';
import {
  ParentAccessError,
  requireParentContext,
  requireParentChild,
} from '@/lib/server/parentAccess';
import { createGroupSubscriptionCheckout } from '@/lib/payments/groupSubscriptionCheckout';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const body = (await request.json().catch(() => ({}))) as {
      childId?: string;
      groupId?: string;
      seatType?: string;
    };
    const { childId, groupId } = body;
    // Only 'physical' is meaningful here; anything else is online, which is what
    // an online-only class can offer and what every seat was before 242.
    const seatTypeFromBody = body.seatType === 'physical' ? 'physical' : 'online';
    if (!childId || !groupId) {
      return NextResponse.json({ error: 'Missing childId or groupId' }, { status: 400 });
    }

    // 404s if this is not the parent's child. Everything below spends money on
    // that child's behalf, so it is the first thing established.
    await requireParentChild(parentProfile.id, childId);

    // Stripe emails the receipt to the card holder, so it must be the parent's
    // address — the child's would send a parent's payment confirmation to a
    // minor and leave the payer with no record of what they were charged.
    const { data: payer } = await admin
      .from('profiles')
      .select('email')
      .eq('id', parentProfile.id)
      .maybeSingle();

    const payerEmail = (payer as { email: string | null } | null)?.email ?? null;
    if (!payerEmail) {
      return NextResponse.json(
        { error: 'Your account is missing an email address' },
        { status: 400 }
      );
    }

    const result = await createGroupSubscriptionCheckout({
      admin,
      groupId,
      studentId: childId,
      payerId: parentProfile.id,
      payerEmail,
      seatType: seatTypeFromBody,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/enroll-child/subscribe]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
