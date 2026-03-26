import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };
function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return code === '42703' || code === '42P01' || code === 'PGRST205' || msg.includes('does not exist');
}

// GET /api/groups/[groupId]/members — list members (tutor sees all, members see approved)
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Check if user is tutor of this group
    const { data: group } = await service
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();

    const isTutor = group?.tutor_id === user.id;

    let query = service
      .from('group_members')
      .select('id, group_id, user_id, status, joined_at, profile:profiles(id, full_name, avatar_url, role)')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });

    if (!isTutor) {
      query = query.eq('status', 'approved');
    }

    const { data: members, error } = await query;
    if (error) throw error;

    return NextResponse.json({ members: members ?? [] });
  } catch (err) {
    console.error('[GET /api/groups/[groupId]/members]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[groupId]/members — request to join a group (student)
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Check group exists and is not archived
    const { data: group } = await service
      .from('groups')
      .select('id, tutor_id')
      .eq('id', groupId)
      .is('archived_at', null)
      .single();

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    if (group.tutor_id === user.id) {
      return NextResponse.json({ error: 'Tutor cannot join their own group' }, { status: 400 });
    }

    // Require at least one configured session before students can request access.
    const { count: sessionCount, error: sessionsError } = await service
      .from('group_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId);

    if (sessionsError && !isSchemaMismatch(sessionsError)) {
      throw sessionsError;
    }
    if (sessionsError && isSchemaMismatch(sessionsError)) {
      return NextResponse.json(
        { error: 'This group is not accepting requests yet. Tutor must add at least one session first.' },
        { status: 400 }
      );
    }
    if ((sessionCount ?? 0) < 1) {
      return NextResponse.json(
        { error: 'This group is not accepting requests yet. Tutor must add at least one session first.' },
        { status: 400 }
      );
    }

    // Check for existing membership
    const { data: existing } = await service
      .from('group_members')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ member: existing, already_exists: true });
    }

    const { data: member, error } = await service
      .from('group_members')
      .insert({ group_id: groupId, user_id: user.id, status: 'pending' })
      .select()
      .single();

    if (error) throw error;

    // Notify tutor of new join request (non-critical)
    try {
      await service.from('notifications').insert({
        user_id: group.tutor_id,
        type: 'booking_request',
        title: 'New group join request',
        message: 'A student has requested to join your group.',
        link: `/groups`,
        group_id: groupId,
      });
    } catch {
      // Non-critical: notifications table may use a different name
    }

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/members]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
