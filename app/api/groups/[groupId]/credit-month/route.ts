// POST /api/groups/[groupId]/credit-month
// A student buys ONE month of a class with their iTutor credits (scenario B).
// Body: { seatType? }
//
// Credits must cover the whole month — there is no part-card payment. Success
// is 201 { completed: true }; too few credits is 422 with shortfall_ttd.
// The month never renews. See lib/credits/creditMonthCheckout.ts.
//
// Authorisation is the session, as for /subscribe. The parent's gate is the
// one difference (owner's decision, Oct 2026): credits a student EARNED are
// theirs to spend, so a child who needs approval for everything else can still
// join with credits that cover the whole month — no request, no wait — and
// every linked parent is emailed that they joined. If the credits fall short,
// it is the usual path: a request goes to the parent (202).

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createClassJoinRequest, nextSessionLabel, resolveClassJoinGate } from '@/lib/server/classJoinRequests';
import { notifyParentsChildJoinedWithCredits } from '@/lib/server/classRequestNotify';
import { createCreditMonthCheckout } from '@/lib/credits/creditMonthCheckout';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ groupId: string }> };

/** Refusals that mean "credits can't pay for this" — the parent can still be asked. */
const FALL_BACK_TO_PARENT = new Set(['no_balance', 'not_enough', 'credits_unavailable']);

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

    // The child's own credits, from the child's own wallet.
    const result = await createCreditMonthCheckout({
      admin,
      groupId,
      studentId: user.id,
      payerId: user.id,
      seatType,
    });

    if (!gate.needsParentApproval) {
      return NextResponse.json(result.body, { status: result.status });
    }

    if (result.ok) {
      await afterDependentJoined(admin, { groupId, studentId: user.id, body: result.body });
      return NextResponse.json({ ...result.body, parent_notified: true }, { status: result.status });
    }

    // Credits could not pay — the approval path, exactly as before.
    if (FALL_BACK_TO_PARENT.has(String(result.body.reason ?? ''))) {
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

    // Full, already enrolled, a checkout in progress: the same answer anyone gets.
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/credit-month]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * A dependent child is in. Settle any request they had left with the parent for
 * this class (the parent must not be asked to approve something already done),
 * then tell every linked parent. Neither may undo a join that happened.
 */
async function afterDependentJoined(
  admin: SupabaseClient,
  params: { groupId: string; studentId: string; body: Record<string, unknown> }
) {
  const now = new Date().toISOString();
  try {
    await admin
      .from('class_join_requests')
      .update({ status: 'WITHDRAWN', decided_at: now, updated_at: now })
      .eq('group_id', params.groupId)
      .eq('student_id', params.studentId)
      .eq('status', 'PENDING');
  } catch (e) {
    console.error('[credit-month] settling the pending parent request failed:', e);
  }

  try {
    const { data: group } = await admin
      .from('groups')
      .select('name, tutor_id')
      .eq('id', params.groupId)
      .maybeSingle();
    const g = group as { name: string | null; tutor_id: string | null } | null;
    let tutorName = 'their tutor';
    if (g?.tutor_id) {
      const { data: tutor } = await admin
        .from('profiles')
        .select('display_name, full_name')
        .eq('id', g.tutor_id)
        .maybeSingle();
      const t = tutor as { display_name: string | null; full_name: string | null } | null;
      tutorName = t?.display_name || t?.full_name || tutorName;
    }

    await notifyParentsChildJoinedWithCredits(admin, {
      studentId: params.studentId,
      groupId: params.groupId,
      className: g?.name ?? 'a class',
      tutorName,
      scheduleLabel: await nextSessionLabel(admin, params.groupId),
      creditsTtd: Number(params.body.credits_applied ?? params.body.amount ?? 0),
      accessUntil: (params.body.period_end as string | null) ?? null,
    });
  } catch (e) {
    console.error('[credit-month] parent notification failed:', e);
  }
}
