export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; childId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId, childId } = await params;
    const service = getServiceClient();

    const { data: link } = await service
      .from('parent_child_links')
      .select('id')
      .eq('parent_id', user.id)
      .eq('child_id', childId)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ error: 'Not linked to this child' }, { status: 403 });
    }

    const { data: settings } = await service
      .from('group_feedback_settings')
      .select('allow_parent_access')
      .eq('group_id', groupId)
      .maybeSingle();

    if (!settings?.allow_parent_access) {
      return NextResponse.json({ error: 'Parent access is not enabled for this class' }, { status: 403 });
    }

    const { data: entries, error } = await service
      .from('group_feedback_entries')
      .select(`
        id, period_id, status, rating_participation, rating_understanding, rating_effort, comment, submitted_at,
        period:group_feedback_periods!inner(id, period_label, frequency, period_start, period_end)
      `)
      .eq('group_id', groupId)
      .eq('student_id', childId)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    const { data: group } = await service
      .from('groups')
      .select('tutor_id, tutor:profiles!inner(full_name)')
      .eq('id', groupId)
      .single();

    const tutorName = (group as any)?.tutor?.full_name ?? 'Tutor';

    const { data: child } = await service
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', childId)
      .single();

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
    }));

    return NextResponse.json({
      child: {
        id: childId,
        full_name: child?.full_name ?? 'Student',
        avatar_url: child?.avatar_url ?? null,
      },
      feedback: cards,
    });
  } catch (err) {
    console.error('[GET feedback/parent/[childId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
