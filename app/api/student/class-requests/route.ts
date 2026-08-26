// The student's side of parent approval for a GROUP CLASS.
//
// WHY THIS EXISTS SEPARATELY FROM /api/groups/[groupId]/members
// That route joins a class and, when the parent's gate applies, raises a request
// instead. It is therefore only reachable for a class a student could join —
// free ones. A dependent child looking at a PAID class had no way to ask at all:
// the only buttons were "Secure your spot" and "Subscribe", both of which go
// straight to a card form the child is not allowed to reach.
//
// This route asks, and never joins. It writes one row in class_join_requests and
// sends the parent an email. Because it cannot enrol anybody, it is safe on a
// paid class in a way the join routes are not — the price is the parent's
// problem to settle when they enrol the child, and nothing here touches money.
//
// GET answers the question the UI has to ask before it can draw a button:
// does this student need permission, and have they already asked?

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  createClassJoinRequest,
  nextSessionLabel,
  pendingRequestForStudent,
  resolveClassJoinGate,
} from '@/lib/server/classJoinRequests';
import { notifyStudentAskedParent } from '@/lib/server/classRequestNotify';

export const dynamic = 'force-dynamic';

const nameOf = (
  row: { full_name: string | null; display_name: string | null } | null,
  fallback: string
) => row?.display_name || row?.full_name || fallback;

export async function GET(req: NextRequest) {
  try {
    const groupId = req.nextUrl.searchParams.get('groupId');
    if (!groupId) return NextResponse.json({ error: 'Missing groupId' }, { status: 400 });

    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Signed out is not an error here. The class page is public, and a visitor
    // who has not logged in simply has no gate — the join CTA sends them to
    // sign in, and this answer is what lets it keep saying "Join" until then.
    if (!user) {
      return NextResponse.json({ needsParentApproval: false, parentName: null, pending: null });
    }

    const admin = getServiceClient();
    const gate = await resolveClassJoinGate(admin, user.id);
    if (!gate.needsParentApproval) {
      return NextResponse.json({ needsParentApproval: false, parentName: null, pending: null });
    }

    const [{ data: parent }, pending] = await Promise.all([
      admin
        .from('profiles')
        .select('full_name, display_name')
        .eq('id', gate.parentId)
        .maybeSingle(),
      pendingRequestForStudent(admin, { groupId, studentId: user.id }),
    ]);

    return NextResponse.json({
      needsParentApproval: true,
      parentName: nameOf(parent as never, 'your parent'),
      pending: pending ? { id: pending.id, requestedAt: pending.requested_at } : null,
    });
  } catch (err) {
    console.error('[GET /api/student/class-requests]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { groupId?: string };
    const groupId = body.groupId;
    if (!groupId) return NextResponse.json({ error: 'Missing groupId' }, { status: 400 });

    const admin = getServiceClient();

    // The gate is re-read here rather than trusted from the client. A student
    // whose parent has since turned self-pay on should enrol normally, not sit
    // in a queue nobody is watching.
    const gate = await resolveClassJoinGate(admin, user.id);
    if (!gate.needsParentApproval) {
      return NextResponse.json(
        { error: 'You do not need approval to join a class.', reason: 'not_required' },
        { status: 400 }
      );
    }

    const created = await createClassJoinRequest(admin, {
      groupId,
      studentId: user.id,
      parentId: gate.parentId,
    });
    if (!created.ok) {
      const status = created.reason === 'class_unavailable' ? 410 : 400;
      return NextResponse.json(
        {
          error:
            created.reason === 'class_unavailable'
              ? 'That class is no longer available.'
              : 'Could not send the request.',
        },
        { status }
      );
    }

    // createClassJoinRequest emails the PARENT. This tells the STUDENT what was
    // sent on their behalf, and is non-critical: a request that exists must not
    // be reported as failed because a mail server was slow.
    try {
      const { data: group } = await admin
        .from('groups')
        .select('name, tutor_id, price_monthly')
        .eq('id', groupId)
        .maybeSingle();
      const g = group as { name: string | null; tutor_id: string; price_monthly: number | string | null } | null;

      const [{ data: parent }, { data: tutor }] = await Promise.all([
        admin.from('profiles').select('full_name, display_name').eq('id', gate.parentId).maybeSingle(),
        g?.tutor_id
          ? admin.from('profiles').select('full_name, display_name').eq('id', g.tutor_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      await notifyStudentAskedParent(admin, {
        studentId: user.id,
        parentName: nameOf(parent as never, 'your parent'),
        className: g?.name ?? 'that class',
        tutorName: nameOf(tutor as never, 'your tutor'),
        scheduleLabel: await nextSessionLabel(admin, groupId),
        priceTtd: Number(g?.price_monthly ?? 0),
        alreadyPending: created.alreadyPending,
      });
    } catch (e) {
      console.error('[student/class-requests] student receipt failed:', e);
    }

    // 202: asked, not joined. The UI must never render this as enrolled.
    return NextResponse.json(
      {
        parent_approval_required: true,
        request_id: created.requestId,
        already_pending: created.alreadyPending,
        message: created.alreadyPending
          ? 'Your parent already has this request.'
          : 'Sent to your parent for approval.',
      },
      { status: 202 }
    );
  } catch (err) {
    console.error('[POST /api/student/class-requests]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
