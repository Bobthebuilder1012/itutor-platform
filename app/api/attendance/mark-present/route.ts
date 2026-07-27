// Records that the logged-in student clicked Join for a specific session/occurrence
// → Present (mig 196). Called fire-and-forget from Join controls; must be fast and
// must never block the join. student_id is always the authenticated user.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

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
    await admin.from('session_attendance_log').upsert(
      { student_id: user.id, occurrence_type: occurrenceType, occurrence_id: occurrenceId, group_id: body.groupId ?? null },
      { onConflict: 'student_id,occurrence_type,occurrence_id', ignoreDuplicates: true }
    );
    return NextResponse.json({ ok: true });
  } catch {
    // Never let attendance capture surface an error to the joining student.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
