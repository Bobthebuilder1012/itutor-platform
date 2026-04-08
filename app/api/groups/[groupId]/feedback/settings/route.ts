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

    const { data: settings } = await service
      .from('group_feedback_settings')
      .select('*')
      .eq('group_id', groupId)
      .maybeSingle();

    return NextResponse.json({
      settings: settings ?? {
        group_id: groupId,
        enabled: false,
        frequency: 'weekly',
        deadline_days: 3,
        include_ratings: true,
        notify_students: true,
        allow_parent_access: true,
      },
    });
  } catch (err: any) {
    console.error('[GET feedback/settings]', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await params;
    const service = getServiceClient();

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (group.tutor_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const payload = {
      group_id: groupId,
      enabled: !!body.enabled,
      frequency: body.frequency ?? 'weekly',
      deadline_days: body.deadline_days ?? 3,
      include_ratings: body.include_ratings ?? true,
      notify_students: body.notify_students ?? true,
      allow_parent_access: body.allow_parent_access ?? true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await service
      .from('group_feedback_settings')
      .upsert(payload, { onConflict: 'group_id' })
      .select()
      .single();

    if (error) throw error;

    if (payload.enabled) {
      await ensureCurrentPeriod(service, groupId, payload.frequency, payload.deadline_days);
    }

    return NextResponse.json({ settings: data });
  } catch (err: any) {
    console.error('[PUT feedback/settings]', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}

async function ensureCurrentPeriod(
  service: ReturnType<typeof getServiceClient>,
  groupId: string,
  frequency: string,
  deadlineDays: number,
) {
  const now = new Date();

  const { data: existing } = await service
    .from('group_feedback_periods')
    .select('id, frequency')
    .eq('group_id', groupId)
    .gte('period_end', now.toISOString())
    .limit(1);

  if (existing && existing.length > 0) {
    const current = existing[0] as any;
    if (current.frequency === frequency) return;

    // Frequency changed — delete old periods and their entries so we can recreate
    const { data: oldPeriods } = await service
      .from('group_feedback_periods')
      .select('id')
      .eq('group_id', groupId);

    const oldIds = (oldPeriods ?? []).map((p: any) => p.id);
    if (oldIds.length > 0) {
      await service.from('group_feedback_entries').delete().in('period_id', oldIds);
      await service.from('group_feedback_periods').delete().eq('group_id', groupId);
    }
  }

  let periodStart: Date;
  let periodEnd: Date;
  let label: string;

  if (frequency === 'weekly') {
    const day = now.getDay();
    periodStart = new Date(now);
    periodStart.setDate(now.getDate() - day);
    periodStart.setHours(0, 0, 0, 0);
    periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 6);
    periodEnd.setHours(23, 59, 59, 999);
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    label = `Week of ${fmt(periodStart)} – ${fmt(periodEnd)}`;
  } else if (frequency === 'monthly') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    label = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } else {
    periodStart = new Date(now);
    periodStart.setHours(0, 0, 0, 0);
    periodEnd = new Date(now);
    periodEnd.setHours(23, 59, 59, 999);
    label = `Session – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  const dueAt = new Date(periodEnd);
  dueAt.setDate(dueAt.getDate() + deadlineDays);

  const { data: period, error: periodErr } = await service
    .from('group_feedback_periods')
    .insert({
      group_id: groupId,
      frequency,
      period_label: label,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      due_at: dueAt.toISOString(),
    })
    .select()
    .single();

  if (periodErr || !period) return;

  const { data: members } = await service
    .from('group_members')
    .select('user_id, profile:profiles!inner(role)')
    .eq('group_id', groupId)
    .eq('status', 'approved');

  const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
  const tutorId = group?.tutor_id;

  const students = (members ?? []).filter(
    (m: any) => m.user_id !== tutorId && m.profile?.role !== 'tutor',
  );

  if (students.length === 0) return;

  const entries = students.map((s: any) => ({
    period_id: period.id,
    group_id: groupId,
    student_id: s.user_id,
    tutor_id: tutorId,
    status: 'pending',
  }));

  await service.from('group_feedback_entries').insert(entries);
}
