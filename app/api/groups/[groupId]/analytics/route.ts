import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };
function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return code === '42703' || code === '42P01' || code === 'PGRST205' || msg.includes('does not exist');
}

function extractProfileName(profile: unknown): string {
  if (Array.isArray(profile)) {
    const first = profile[0];
    if (first && typeof first === 'object' && 'full_name' in first) {
      const fullName = (first as { full_name?: unknown }).full_name;
      if (typeof fullName === 'string' && fullName.trim().length > 0) return fullName;
    }
    return 'Student';
  }

  if (profile && typeof profile === 'object' && 'full_name' in profile) {
    const fullName = (profile as { full_name?: unknown }).full_name;
    if (typeof fullName === 'string' && fullName.trim().length > 0) return fullName;
  }

  return 'Student';
}

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    const { data: group } = await service.from('groups').select('id, tutor_id').eq('id', groupId).single();
    if (!group || group.tutor_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let members: any[] | null = null;
    let sessions: any[] | null = null;
    let attendance: any[] | null = null;

    let membersResult: { data: any[] | null; error: any } = await service
      .from('group_members')
      .select('user_id, joined_at, status, profile:profiles(full_name)')
      .eq('group_id', groupId);
    if (membersResult.error && isSchemaMismatch(membersResult.error)) {
      membersResult = await service
        .from('group_members')
        .select('user_id, joined_at, status')
        .eq('group_id', groupId);
    }
    if (membersResult.error && !isSchemaMismatch(membersResult.error)) throw membersResult.error;
    members = membersResult.data ?? [];

    let sessionsResult = await service
      .from('group_sessions')
      .select('id, group_session_occurrences(id)')
      .eq('group_id', groupId);
    if (sessionsResult.error && isSchemaMismatch(sessionsResult.error)) {
      return NextResponse.json({
        success: true,
        data: {
          total_sessions: 0,
          average_attendance_rate: 0,
          student_retention_rate: 0,
          student_analytics: [],
        },
      });
    }
    if (sessionsResult.error) throw sessionsResult.error;
    sessions = sessionsResult.data ?? [];

    const occurrenceIds =
      (sessions ?? []).flatMap((s: any) => (s.group_session_occurrences ?? []).map((o: any) => o.id)).filter(Boolean);

    if (occurrenceIds.length > 0) {
      const attendanceResult = await service
        .from('group_attendance_records')
        .select('student_id, status')
        .in('session_id', occurrenceIds);
      if (attendanceResult.error && !isSchemaMismatch(attendanceResult.error)) throw attendanceResult.error;
      attendance = attendanceResult.data ?? [];
    } else {
      attendance = [];
    }

    const approvedMembers = (members ?? []).filter((m: any) => m.status === 'approved');
    const attendanceRows = attendance ?? [];

    const byStudent = new Map<
      string,
      { student_id: string; student_name: string; attended: number; missed: number; late: number; joined_at: string | null }
    >();
    for (const m of approvedMembers) {
      byStudent.set(m.user_id, {
        student_id: m.user_id,
        student_name: extractProfileName(m.profile),
        attended: 0,
        missed: 0,
        late: 0,
        joined_at: m.joined_at ?? null,
      });
    }
    for (const row of attendanceRows) {
      const metric = byStudent.get(row.student_id);
      if (!metric) continue;
      if (row.status === 'PRESENT') metric.attended += 1;
      else if (row.status === 'ABSENT') metric.missed += 1;
      else metric.late += 1;
    }

    const student_analytics = Array.from(byStudent.values());
    const total_sessions =
      (sessions ?? []).reduce((acc: number, s: any) => acc + Number((s.group_session_occurrences ?? []).length), 0) ?? 0;
    const total_attendance_marks = attendanceRows.length;
    const present_count = attendanceRows.filter((r: any) => r.status === 'PRESENT').length;
    const average_attendance_rate = total_attendance_marks > 0 ? Number(((present_count / total_attendance_marks) * 100).toFixed(1)) : 0;
    const student_retention_rate =
      approvedMembers.length > 0
        ? Number(
            (
              (student_analytics.filter((s) => s.attended + s.late > 0).length / approvedMembers.length) *
              100
            ).toFixed(1)
          )
        : 0;

    return NextResponse.json({
      success: true,
      data: {
        total_sessions,
        average_attendance_rate,
        student_retention_rate,
        student_analytics,
      },
    });
  } catch (err) {
    console.error('[GET /api/groups/[groupId]/analytics]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
