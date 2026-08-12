// POST /api/parent/approvals/[bookingId]/decline — handover §4.4.
//
// "Decline captures an optional reason, sent to the student verbatim."
//
// Verbatim is a product decision with teeth: the reason is stored and delivered
// exactly as typed, not summarised and not softened. A parent who writes
// "clashes with football practice — try Saturdays" is giving their child usable
// information, and rewording it would remove the only thing that makes a
// decline feel like a conversation rather than a refusal.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { assertParentOfStudent, checkApprovalWindow } from '@/lib/server/bookingRequests';
import { loadRequestContext } from '@/lib/server/bookingRequestContext';
import { notifyStudentOfDecline } from '@/lib/server/bookingRequestNotify';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ bookingId: string }> };

/** Long enough for a real explanation, short enough not to be a payload. */
const MAX_REASON = 1000;

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { bookingId } = await params;

    const body = (await request.json().catch(() => ({}))) as { reason?: string | null };
    const reason = (body.reason ?? '').trim().slice(0, MAX_REASON) || null;

    const ctx = await loadRequestContext(admin, bookingId);
    if (!ctx) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

    const isParent = await assertParentOfStudent(admin, parentProfile.id, ctx.student.id);
    if (!isParent) return NextResponse.json({ error: 'Not your child' }, { status: 403 });

    // A closed request cannot be declined either — it already ended as EXPIRED,
    // and overwriting that would tell the student their parent refused when in
    // fact nobody answered.
    const window = checkApprovalWindow(ctx.booking);
    if (!window.ok) {
      return NextResponse.json({ error: window.reason }, { status: 409 });
    }

    const nowIso = new Date().toISOString();

    const { error } = await admin
      .from('bookings')
      .update({
        status: 'PARENT_REJECTED',
        decline_reason: reason,
        decided_at: nowIso,
        decided_by: parentProfile.id,
        parent_rejected_at: nowIso,
        parent_notes: reason,
        payment_required: false,
        payment_status: 'unpaid',
      })
      .eq('id', bookingId)
      .eq('status', 'PENDING_PARENT_APPROVAL');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await notifyStudentOfDecline(admin, {
      studentId: ctx.student.id,
      studentEmail: ctx.student.email,
      studentName: ctx.student.name,
      parentName: parentProfile.full_name ?? 'Your parent',
      subjectLabel: ctx.subjectLabel,
      reason,
      bookingId,
    });

    return NextResponse.json({
      ok: true,
      message: `${ctx.student.name.split(' ')[0]} has been told${reason ? ', with your reason.' : '.'}`,
    });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/approvals/[bookingId]/decline]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
