// POST /api/parent/enroll-child/credit-month
// A parent buys ONE month of a class for a linked child with the PARENT's
// credits (scenario B). Body: { childId, groupId, seatType? }
//
// The child is the student (roster, schedule, attendance); the parent's wallet
// pays for the whole month — there is no part-card payment. Same authorisation proof as
// /api/parent/enroll-child/subscribe: requireParentChild, never a flag.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';
import { createCreditMonthCheckout } from '@/lib/credits/creditMonthCheckout';

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
    if (!childId || !groupId) {
      return NextResponse.json({ error: 'Missing childId or groupId' }, { status: 400 });
    }
    const seatType = body.seatType === 'physical' ? 'physical' : 'online';

    await requireParentChild(parentProfile.id, childId);

    const result = await createCreditMonthCheckout({
      admin,
      groupId,
      studentId: childId,
      payerId: parentProfile.id,
      seatType,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/enroll-child/credit-month]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
