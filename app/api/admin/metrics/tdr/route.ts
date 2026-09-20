/**
 * TDR — students brought by teachers ÷ activated teachers.
 *
 * COMPUTED IN TYPESCRIPT, NOT AS A VIEW. A reporting view over profiles would
 * be the obvious shape and is the wrong one here: Supabase grants ALL on every
 * new relation in public to anon and authenticated, a view carries no RLS of
 * its own, and migration 255 exists on another branch precisely because that
 * combination turned auto-updatable views into unauthenticated write paths
 * into their base tables. A view joining profiles to invitations would be the
 * worst instance of that pattern in this database. The cohort window is also a
 * parameter, which a view cannot take, and the row counts here are in the
 * hundreds.
 *
 * ONE STUDENT, ONE TEACHER. Credit goes to the first teacher whose invitation
 * they joined through — the same first-touch rule the attribution cookie uses,
 * so a second teacher inviting the same person never takes the credit away
 * from the one who actually brought them.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { LAUNCH_GOAL_TARGET, LAUNCH_WINDOW_DAYS } from '@/lib/classInvites/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DAY_MS = 86_400_000;
const MAX_TEACHERS = 1000;

type TeacherRow = {
  tutorId: string;
  name: string;
  email: string | null;
  verifiedAt: string;
  daysSince: number;
  joined14: number;
  joinedAll: number;
  invited: number;
  inWindow: boolean;
};

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const days = Number(url.searchParams.get('days') ?? '0');
    const admin = getServiceClient();

    let teacherQuery = admin
      .from('profiles')
      .select('id, full_name, display_name, email, tutor_verified_at')
      .eq('role', 'tutor')
      .not('tutor_verified_at', 'is', null)
      .order('tutor_verified_at', { ascending: false })
      .limit(MAX_TEACHERS);

    if (days > 0) {
      teacherQuery = teacherQuery.gte(
        'tutor_verified_at',
        new Date(Date.now() - days * DAY_MS).toISOString()
      );
    }

    const { data: teacherData, error: teacherError } = await teacherQuery;
    if (teacherError) return NextResponse.json({ error: teacherError.message }, { status: 500 });

    const teachers = (teacherData ?? []) as Array<{
      id: string;
      full_name: string | null;
      display_name: string | null;
      email: string | null;
      tutor_verified_at: string;
    }>;

    if (teachers.length === 0) {
      return NextResponse.json({
        unavailable: false,
        target: LAUNCH_GOAL_TARGET,
        activatedTeachers: 0,
        studentsBrought: 0,
        students14: 0,
        tdr: 0,
        tdr14: 0,
        median: 0,
        teachersAtGoal: 0,
        teachersWithNone: 0,
        distribution: [],
        rows: [],
      });
    }

    const tutorIds = teachers.map((t) => t.id);

    const { data: inviteData, error: inviteError } = await admin
      .from('class_invites')
      .select('tutor_id, joined_student_id, joined_at, status')
      .in('tutor_id', tutorIds);

    // The same degradation the tutor-facing surfaces use: an environment
    // without migration 257 says so, rather than reporting a TDR of zero,
    // which is indistinguishable from a real and alarming answer.
    if (inviteError) {
      const missing =
        inviteError.code === '42P01' ||
        /does not exist|schema cache/i.test(inviteError.message ?? '');
      if (missing) {
        return NextResponse.json({ unavailable: true });
      }
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    const invites = (inviteData ?? []) as Array<{
      tutor_id: string;
      joined_student_id: string | null;
      joined_at: string | null;
      status: string;
    }>;

    // First teacher wins, per student.
    const firstByStudent = new Map<string, { tutorId: string; joinedAt: number }>();
    for (const row of invites) {
      if (row.status !== 'joined' || !row.joined_student_id || !row.joined_at) continue;
      const at = Date.parse(row.joined_at);
      const prev = firstByStudent.get(row.joined_student_id);
      if (!prev || at < prev.joinedAt) {
        firstByStudent.set(row.joined_student_id, { tutorId: row.tutor_id, joinedAt: at });
      }
    }

    const creditsByTutor = new Map<string, number[]>();
    for (const credit of firstByStudent.values()) {
      const list = creditsByTutor.get(credit.tutorId) ?? [];
      list.push(credit.joinedAt);
      creditsByTutor.set(credit.tutorId, list);
    }

    const invitedByTutor = new Map<string, number>();
    for (const row of invites) {
      if (row.status !== 'pending' && row.status !== 'accepted') continue;
      invitedByTutor.set(row.tutor_id, (invitedByTutor.get(row.tutor_id) ?? 0) + 1);
    }

    const now = Date.now();
    const rows: TeacherRow[] = teachers.map((t) => {
      const verifiedAt = Date.parse(t.tutor_verified_at);
      const windowEnd = verifiedAt + LAUNCH_WINDOW_DAYS * DAY_MS;
      const credits = creditsByTutor.get(t.id) ?? [];
      return {
        tutorId: t.id,
        name: t.display_name || t.full_name || 'Unnamed',
        email: t.email,
        verifiedAt: t.tutor_verified_at,
        daysSince: Math.max(0, Math.floor((now - verifiedAt) / DAY_MS)),
        joined14: credits.filter((at) => at < windowEnd).length,
        joinedAll: credits.length,
        invited: invitedByTutor.get(t.id) ?? 0,
        inWindow: now < windowEnd,
      };
    });

    const activated = rows.length;
    const studentsBrought = rows.reduce((n, r) => n + r.joinedAll, 0);
    const students14 = rows.reduce((n, r) => n + r.joined14, 0);

    // The median beside the mean, because a TDR of 5 made by one teacher with
    // sixty students is a different business from twelve teachers with five
    // each, and only one of those is a repeatable motion.
    const sorted = rows.map((r) => r.joinedAll).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length === 0
        ? 0
        : sorted.length % 2
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;

    const buckets = ['0', '1', '2', '3', '4', '5-9', '10+'];
    const distribution = buckets.map((bucket) => ({
      bucket,
      count: rows.filter((r) => {
        const n = r.joinedAll;
        if (bucket === '5-9') return n >= 5 && n <= 9;
        if (bucket === '10+') return n >= 10;
        return n === Number(bucket);
      }).length,
    }));

    return NextResponse.json({
      unavailable: false,
      target: LAUNCH_GOAL_TARGET,
      activatedTeachers: activated,
      studentsBrought,
      students14,
      tdr: activated ? Number((studentsBrought / activated).toFixed(2)) : 0,
      tdr14: activated ? Number((students14 / activated).toFixed(2)) : 0,
      median,
      teachersAtGoal: rows.filter((r) => r.joined14 >= LAUNCH_GOAL_TARGET).length,
      teachersWithNone: rows.filter((r) => r.joinedAll === 0).length,
      distribution,
      rows: rows.sort((a, b) => b.joinedAll - a.joinedAll),
      truncated: teachers.length >= MAX_TEACHERS,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
