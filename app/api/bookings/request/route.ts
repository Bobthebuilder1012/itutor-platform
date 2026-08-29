// POST /api/bookings/request — a dependent student asks their parent for a class.
//
// Handover §4.1. This is the dependent half of the branch; a self-paying student
// never reaches here and keeps the existing checkout untouched (decision 2:
// "Dependent students request classes and never pay — no card, no checkout").
//
// The branch is decided server-side from the parent link, not from anything the
// client says, so a dependent student cannot post their way into the paying
// path by claiming to be self-funding.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createParentApprovalRequest, resolveBilling } from '@/lib/server/bookingRequests';
import { loadRequestContext } from '@/lib/server/bookingRequestContext';
import { notifyParentOfRequest } from '@/lib/server/bookingRequestNotify';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      tutorId?: string;
      subjectId?: string;
      sessionTypeId?: string;
      requestedStartAt?: string;
      requestedEndAt?: string;
      durationMinutes?: number;
      studentNotes?: string | null;
      kind?: 'one_to_one' | 'group';
    };

    const { tutorId, subjectId, sessionTypeId, requestedStartAt, requestedEndAt } = body;
    if (!tutorId || !subjectId || !sessionTypeId || !requestedStartAt || !requestedEndAt) {
      return NextResponse.json({ error: 'Missing booking details' }, { status: 400 });
    }

    const admin = getServiceClient();

    const billing = await resolveBilling(admin, user.id);
    if (billing.mode !== 'parent_approval') {
      // Not an error — the caller should use the ordinary checkout. Saying which
      // keeps the client from having to duplicate the branch logic.
      return NextResponse.json(
        { error: 'This student pays for their own classes', route: 'self_pay' },
        { status: 409 }
      );
    }

    // Decision 10: freeze the price as listed *now*. Read it from the tutor's
    // session type rather than the request body — a client-supplied price is a
    // client-supplied discount.
    const { data: sessionType } = await admin
      .from('session_types')
      .select('id, tutor_id, price_ttd, duration_minutes')
      .eq('id', sessionTypeId)
      .maybeSingle();

    if (!sessionType || sessionType.tutor_id !== tutorId) {
      return NextResponse.json({ error: 'Unknown session type for this tutor' }, { status: 400 });
    }

    const priceTtd = Number(sessionType.price_ttd ?? 0);
    const durationMinutes =
      body.durationMinutes ?? Number(sessionType.duration_minutes ?? 60);

    const created = await createParentApprovalRequest(admin, {
      studentId: user.id,
      tutorId,
      subjectId,
      sessionTypeId,
      requestedStartAt,
      requestedEndAt,
      durationMinutes,
      priceTtd,
      studentNotes: body.studentNotes ?? null,
      kind: body.kind ?? 'one_to_one',
    });

    if (!created.ok) {
      const status = created.reason === 'too_late_to_request' ? 409 : 400;
      return NextResponse.json({ error: created.reason }, { status });
    }

    // §4.3 — email and in-app, both. Failure to notify must not undo the
    // request: it exists, and the parent can still find it in their queue.
    try {
      const ctx = await loadRequestContext(admin, created.bookingId);
      if (ctx && ctx.parent) {
        await notifyParentOfRequest(admin, {
          parentId: ctx.parent.id,
          parentEmail: ctx.parent.email,
          parentName: ctx.parent.name,
          childId: ctx.student.id,
          childName: ctx.student.name,
          tutorName: ctx.tutor.name,
          subjectLabel: ctx.subjectLabel,
          whenLabel: ctx.whenLabel,
          priceTtd: ctx.amountTtd,
          closesAtLabel: ctx.closesAtLabel,
          bookingId: created.bookingId,
        });
      }
    } catch (e) {
      console.error('[bookings/request] notify failed:', e);
    }

    return NextResponse.json({
      ok: true,
      bookingId: created.bookingId,
      expiresAt: created.expiresAt,
      // The client shows this verbatim; statement 3 is not optional copy.
      seatNotice:
        'This spot is not reserved until your parent pays. Someone else can take the last place while you wait.',
    });
  } catch (err) {
    console.error('[POST /api/bookings/request]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
