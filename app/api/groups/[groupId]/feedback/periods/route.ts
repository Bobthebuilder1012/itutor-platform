export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await params;
    const service = getServiceClient();

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (group.tutor_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: periods, error } = await service
      .from('group_feedback_periods')
      .select('*')
      .eq('group_id', groupId)
      .order('period_end', { ascending: false })
      .limit(10);

    if (error) throw error;

    // Fetch attendance data for the group
    const { data: sessions } = await service
      .from('group_sessions')
      .select('id, group_session_occurrences(id)')
      .eq('group_id', groupId);

    const occurrenceIds = (sessions ?? [])
      .flatMap((s: any) => (s.group_session_occurrences ?? []).map((o: any) => o.id))
      .filter(Boolean);

    let attendanceByStudent = new Map<string, { attended: number; total: number }>();
    if (occurrenceIds.length > 0) {
      const { data: records } = await service
        .from('group_attendance_records')
        .select('student_id, status')
        .in('session_id', occurrenceIds);

      const totalOccs = occurrenceIds.length;
      const byStudent = new Map<string, number>();
      (records ?? []).forEach((r: any) => {
        if (r.status === 'PRESENT' || r.status === 'LATE') {
          byStudent.set(r.student_id, (byStudent.get(r.student_id) ?? 0) + 1);
        }
      });
      byStudent.forEach((attended, sid) => {
        attendanceByStudent.set(sid, { attended, total: totalOccs });
      });
    }

    const enriched = await Promise.all(
      (periods ?? []).map(async (p: any) => {
        const { data: entries } = await service
          .from('group_feedback_entries')
          .select('*, student:profiles!group_feedback_entries_student_id_fkey(id, full_name, avatar_url)')
          .eq('period_id', p.id)
          .order('status', { ascending: true });

        const all = (entries ?? []).map((e: any) => {
          const att = attendanceByStudent.get(e.student_id);
          return {
            ...e,
            sessions_attended: att?.attended ?? 0,
            sessions_total: att?.total ?? occurrenceIds.length,
          };
        });

        return {
          ...p,
          entries: all,
          total: all.length,
          submitted: all.filter((e: any) => e.status === 'submitted').length,
          pending: all.filter((e: any) => e.status === 'pending').length,
          skipped: all.filter((e: any) => e.status === 'skipped').length,
        };
      }),
    );

    return NextResponse.json({ periods: enriched });
  } catch (err: any) {
    console.error('[GET feedback/periods]', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
