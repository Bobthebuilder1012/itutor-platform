// POST /api/admin/student-strikes
// Admin manually issues a strike to a student account.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { writeStudentStrike } from '@/lib/reliability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { student_id, reason, session_id, booking_id, notes } = body;

  if (!student_id || !reason) {
    return NextResponse.json({ error: 'student_id and reason are required' }, { status: 400 });
  }

  const admin = getServiceClient();
  const strikeId = await writeStudentStrike(admin, {
    studentId: student_id,
    reason: reason as any,
    sessionId: session_id ?? null,
    bookingId: booking_id ?? null,
    notes: notes ?? `Admin manual strike issued by ${auth.user?.id}`,
  });

  if (!strikeId) {
    return NextResponse.json({ error: 'Failed to issue strike' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, strike_id: strikeId });
}
