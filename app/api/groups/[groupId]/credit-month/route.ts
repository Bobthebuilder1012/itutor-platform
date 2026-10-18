// POST /api/groups/[groupId]/credit-month
// A student buys ONE month of a class with their iTutor credits (scenario B).
// Body: { seatType? }
//
// Credits must cover the whole month — there is no part-card payment. Success
// is 201 { completed: true }; too few credits is 422 with shortfall_ttd.
// The month never renews. See lib/credits/creditMonthCheckout.ts.
//
// Authorisation is the session, as for /subscribe — including the parent's
// gate: a dependent child cannot start a purchase for themselves.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createClassJoinRequest, resolveClassJoinGate } from '@/lib/server/classJoinRequests';
import { createCreditMonthCheckout } from '@/lib/credits/creditMonthCheckout';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ groupId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const body = (await req.json().catch(() => ({}))) as { seatType?: string };
    const seatType = body.seatType === 'physical' ? 'physical' : 'online';

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const result = await createCreditMonthCheckout({
      admin,
      groupId,
      studentId: user.id,
      payerId: user.id,
      seatType,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/credit-month]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
