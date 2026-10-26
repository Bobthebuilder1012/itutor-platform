// POST /api/groups/[groupId]/credit-month
// A student buys ONE month of a class with their iTutor credits (scenario B).
// Body: { useCreditsTtd?, seatType? }
//
// Credits that cover the month finish it here: 201 { completed: true }. Credits
// that cover part of it return a checkout_url for the rest, paid by card.
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
    const body = (await req.json().catch(() => ({}))) as { seatType?: string; useCreditsTtd?: unknown };
    const seatType = body.seatType === 'physical' ? 'physical' : 'online';
    const useCreditsTtd = Number(body.useCreditsTtd) > 0 ? Number(body.useCreditsTtd) : null;

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
      payerEmail: user.email,
      seatType,
      useCreditsTtd,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/credit-month]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
