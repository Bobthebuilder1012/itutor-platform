import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

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

    const [{ data: members }, { data: sessions }, { data: attendance }] = await Promise.all([
      service
        .from('group_members')
        .select('user_id, joined_at, status, profile:profiles(full_name)')
        .eq('group_id', groupId),
      service
        .from('group_sessions')
        .select('id, group_session_occurrences(id)')
        .eq('group_id', groupId),
      service
        .from('group_attendance_records')
        .select('student_id, status')
        .in(
          'session_id',
          (
            (await service
              .from('group_session_occurrences')
              .select('id, group_session_id')
              .in(
                'group_session_id',
                (
                  await service.from('group_sessions').select('id').eq('group_id', groupId)
                ).data?.map((s: any) => s.id) ?? ['00000000-0000-0000-0000-000000000000']
              )) as any
          ).data?.map((o: any) => o.id) ?? ['00000000-0000-0000-0000-000000000000']
        ),
    ]);

    const approvedMembers = (members ?? []).filter((m: any) => m.status === 'approved');
    const attendanceRows = attendance ?? [];

    const byStudent = new Map<
      string,
      { student_id: string; student_name: string; attended: number; missed: number; late: number; joined_at: string | null }
    >();
    for (const m of approvedMembers) {
      byStudent.set(m.user_id, {
        student_id: m.user_id,
        student_name: m.profile?.full_name ?? 'Student',
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
