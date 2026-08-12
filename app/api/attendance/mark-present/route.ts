// Records that the logged-in student clicked Join for a specific session/occurrence
// → Present (mig 196). Called fire-and-forget from Join controls; must be fast and
// must never block the join. student_id is always the authenticated user.
//
// The write uses the service role, which bypasses RLS — so migration 218 locking
// session_attendance_log to read-only does NOT protect this endpoint. It used to
// take `occurrenceId` from the request body on trust, which meant any student
// could POST any occurrence id and be marked Present for a class that finished
// last term, turning a recorded absence into an attendance. Since absence is
// inferred from the lack of a row, that is a silent rewrite of history.
//
// verifyJoinEvent (lib/server/attendance) is what makes this the "verified join
// event" the handover asks for: on the roster, not cancelled, happening now.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { recordStudentJoin, verifyJoinEvent } from '@/lib/server/attendance';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const server = await getServerClient();
    const { data: { user } } = await server.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { occurrenceType?: string; occurrenceId?: string; groupId?: string };
    const occurrenceType = body.occurrenceType;
    const occurrenceId = body.occurrenceId;
    if ((occurrenceType !== 'session' && occurrenceType !== 'group_occurrence') || !occurrenceId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const admin = getServiceClient();

    // Never trust the body for anything but the identifier we then go and check.
    const verified = await verifyJoinEvent(admin, {
      studentId: user.id,
      occurrenceType,
      occurrenceId,
    });
    if (!verified.ok) {
      // 200 on purpose: the Join click must never surface an error, and a
      // refusal here is not the student's problem to solve. `recorded: false`
      // is the signal for anyone debugging a missing attendance row.
      return NextResponse.json({ ok: true, recorded: false, reason: verified.reason });
    }

    // §6: the status is derived here, from the verified occurrence's scheduled
    // start — never from anything the client sent.
    const derived = await recordStudentJoin(admin, {
      studentId: user.id,
      occurrenceType,
      occurrenceId,
      // Taken from the verified occurrence, not from the caller.
      groupId: verified.groupId ?? body.groupId ?? null,
      scheduledStart: verified.scheduledStart,
      joinSource: 'mark-present',
    });

    return NextResponse.json({ ok: true, recorded: true, status: derived.status });
  } catch {
    // Never let attendance capture surface an error to the joining student.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
