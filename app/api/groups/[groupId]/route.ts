import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { UpdateGroupInput } from '@/lib/types/groups';

type Params = { params: Promise<{ groupId: string }> };

// GET /api/groups/[groupId] — get group detail
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const { data: group, error } = await service
      .from('groups')
      .select(`
        id, name, description, tutor_id, subject, pricing, created_at, archived_at,
        tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url),
        group_members(id, user_id, status, joined_at, profile:profiles(id, full_name, avatar_url))
      `)
      .eq('id', groupId)
      .single();

    if (error || !group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const approvedMembers = (group.group_members ?? []).filter((m: any) => m.status === 'approved');
    const currentUserMembership = (group.group_members ?? []).find((m: any) => m.user_id === user.id) ?? null;

    // Fetch sessions with upcoming occurrences (service client bypasses RLS so all users get schedule preview)
    const { data: sessionsRaw } = await service
      .from('group_sessions')
      .select(`
        id, group_id, title, recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on, created_at,
        group_session_occurrences(id, group_session_id, scheduled_start_at, scheduled_end_at, status, cancelled_at, cancellation_note)
      `)
      .eq('group_id', groupId)
      .order('starts_on', { ascending: true });

    const sessions = (sessionsRaw ?? []).map((s: any) => ({
      ...s,
      occurrences: s.group_session_occurrences ?? [],
      group_session_occurrences: undefined,
    }));

    // Find next upcoming occurrence across all sessions
    const now = new Date();
    const allUpcoming = sessions
      .flatMap((s: any) => s.occurrences)
      .filter((o: any) => o.status === 'upcoming' && new Date(o.scheduled_start_at) > now)
      .sort((a: any, b: any) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());

    const nextOccurrence = allUpcoming[0] ?? null;

    return NextResponse.json({
      group: {
        ...group,
        group_members: undefined,
        members: group.group_members,
        member_count: approvedMembers.length,
        member_previews: approvedMembers.slice(0, 3).map((m: any) => m.profile),
        current_user_membership: currentUserMembership,
        sessions,
        next_occurrence: nextOccurrence,
      },
    });
  } catch (err) {
    console.error('[GET /api/groups/[groupId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/groups/[groupId] — update group name/description
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const { data: existing } = await service
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();

    if (!existing || existing.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: UpdateGroupInput = await request.json();
    const updates: Record<string, string> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.subject !== undefined) updates.subject = body.subject;

    const { data: group, error } = await service
      .from('groups')
      .update(updates)
      .eq('id', groupId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ group });
  } catch (err) {
    console.error('[PATCH /api/groups/[groupId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
