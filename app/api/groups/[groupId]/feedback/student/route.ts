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

    const { data: membership } = await service
      .from('group_members')
      .select('status')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.status !== 'approved') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: entries, error } = await service
      .from('group_feedback_entries')
      .select(`
        id, period_id, status, rating_participation, rating_understanding, rating_effort, comment, submitted_at,
        period:group_feedback_periods!inner(id, period_label, frequency, period_start, period_end)
      `)
      .eq('group_id', groupId)
      .eq('student_id', user.id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    const { data: group } = await service
      .from('groups')
      .select('tutor_id, tutor:profiles!inner(full_name)')
      .eq('id', groupId)
      .single();

    const tutorName = (group as any)?.tutor?.full_name ?? 'Tutor';

    // Fetch attendance for this student
    const { data: sessions } = await service
      .from('group_sessions')
      .select('id, group_session_occurrences(id)')
      .eq('group_id', groupId);

    const occurrenceIds = (sessions ?? [])
      .flatMap((s: any) => (s.group_session_occurrences ?? []).map((o: any) => o.id))
      .filter(Boolean);

    let attended = 0;
    const totalSessions = occurrenceIds.length;
    if (occurrenceIds.length > 0) {
      const { data: records } = await service
        .from('group_attendance_records')
        .select('status')
        .eq('student_id', user.id)
        .in('session_id', occurrenceIds);

      attended = (records ?? []).filter((r: any) => r.status === 'PRESENT' || r.status === 'LATE').length;
    }

    const cards = (entries ?? []).map((e: any) => ({
      id: e.id,
      period_label: e.period?.period_label,
      frequency: e.period?.frequency,
      period_start: e.period?.period_start,
      period_end: e.period?.period_end,
      tutor_name: tutorName,
      rating_participation: e.rating_participation,
      rating_understanding: e.rating_understanding,
      rating_effort: e.rating_effort,
      comment: e.comment,
      submitted_at: e.submitted_at,
      sessions_attended: attended,
      sessions_total: totalSessions,
    }));

    return NextResponse.json({ feedback: cards });
  } catch (err) {
    console.error('[GET feedback/student]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
