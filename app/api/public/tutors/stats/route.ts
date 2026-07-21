// POST /api/public/tutors/stats
// Real per-tutor marketplace stats for the 1:1 tutor cards, aggregated with
// the service client so counts are correct regardless of the caller's RLS
// (a student can't read other tutors' sessions directly). Only counts that
// map to data we actually track are returned — no fabricated metrics.
//
// Body: { tutorIds: string[] }
// Returns: { byTutorId: { [id]: { lessonsTaught, studentsTaught, recentBookings } } }

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Sessions that actually took place (see 018_sessions_system.sql).
const HELD_STATUSES = ['COMPLETED_ASSUMED', 'EARLY_END_SHORT'];

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { tutorIds?: string[] };
  const tutorIds = Array.isArray(body?.tutorIds) ? body.tutorIds.filter(Boolean) : [];
  if (tutorIds.length === 0) return NextResponse.json({ byTutorId: {} });
  if (tutorIds.length > 200) return NextResponse.json({ error: 'Too many tutorIds' }, { status: 400 });

  const admin = getServiceClient();

  const { data: rows, error } = await admin
    .from('sessions')
    .select('tutor_id, student_id, status, created_at')
    .in('tutor_id', tutorIds)
    .limit(20000);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const held = new Map<string, number>();
  const students = new Map<string, Set<string>>();
  const recent = new Map<string, number>();

  for (const r of rows ?? []) {
    const tid = r.tutor_id as string;
    if (!tid) continue;
    const status = String(r.status ?? '');

    if (HELD_STATUSES.includes(status)) {
      held.set(tid, (held.get(tid) ?? 0) + 1);
    }
    // Distinct students taught: any non-cancelled session counts them as a student.
    if (status !== 'CANCELLED' && r.student_id) {
      if (!students.has(tid)) students.set(tid, new Set());
      students.get(tid)!.add(r.student_id as string);
    }
    // Recently booked: sessions created in the last 30 days.
    if (r.created_at && new Date(r.created_at).getTime() >= thirtyDaysAgo) {
      recent.set(tid, (recent.get(tid) ?? 0) + 1);
    }
  }

  const byTutorId: Record<string, { lessonsTaught: number; studentsTaught: number; recentBookings: number }> = {};
  for (const id of tutorIds) {
    byTutorId[id] = {
      lessonsTaught: held.get(id) ?? 0,
      studentsTaught: students.get(id)?.size ?? 0,
      recentBookings: recent.get(id) ?? 0,
    };
  }

  return NextResponse.json({ byTutorId });
}
