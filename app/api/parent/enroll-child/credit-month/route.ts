// POST /api/parent/enroll-child/credit-month
// A parent buys ONE month of a class for a linked child with the PARENT's
// credits (scenario B). Body: { childId, groupId, useCreditsTtd?, seatType? }
//
// The child is the student (roster, schedule, attendance); the parent's wallet
// pays, and the parent's card covers any remainder. Same authorisation proof as
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
      useCreditsTtd?: unknown;
    };
    const { childId, groupId } = body;
    if (!childId || !groupId) {
      return NextResponse.json({ error: 'Missing childId or groupId' }, { status: 400 });
    }
    const seatType = body.seatType === 'physical' ? 'physical' : 'online';
    const useCreditsTtd = Number(body.useCreditsTtd) > 0 ? Number(body.useCreditsTtd) : null;

    await requireParentChild(parentProfile.id, childId);

    const { data: payer } = await admin.from('profiles').select('email').eq('id', parentProfile.id).maybeSingle();

    const result = await createCreditMonthCheckout({
      admin,
      groupId,
      studentId: childId,
      payerId: parentProfile.id,
      payerEmail: (payer as { email: string | null } | null)?.email ?? null,
      seatType,
      useCreditsTtd,
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
