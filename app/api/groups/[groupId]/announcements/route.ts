import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

// GET /api/groups/[groupId]/announcements
export async function GET(
  _req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    const { groupId } = params;

    // Verify caller is tutor or approved member
    const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const isTutor = group.tutor_id === user.id;
    if (!isTutor) {
      const { data: membership } = await service
        .from('group_members')
        .select('status')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();
      if (!membership || membership.status !== 'approved') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { data: announcements, error } = await service
      .from('group_announcements')
      .select(`
        id, body, is_pinned, edited_at, created_at,
        author:profiles!group_announcements_author_id_fkey(id, full_name, avatar_url)
      `)
      .eq('group_id', groupId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ announcements: announcements ?? [] });
  } catch (err) {
    console.error('[GET /api/groups/[groupId]/announcements]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[groupId]/announcements — tutor only
export async function POST(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    const { groupId } = params;

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (group.tutor_id !== user.id) return NextResponse.json({ error: 'Only the tutor can post announcements' }, { status: 403 });

    const { body } = await req.json();
    if (!body?.trim()) return NextResponse.json({ error: 'Body is required' }, { status: 400 });

    const { data: announcement, error } = await service
      .from('group_announcements')
      .insert({ group_id: groupId, author_id: user.id, body: body.trim() })
      .select(`id, body, is_pinned, edited_at, created_at, author:profiles!group_announcements_author_id_fkey(id, full_name, avatar_url)`)
      .single();

    if (error) throw error;

    // Notify approved members
    const { data: members } = await service
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('status', 'approved')
      .neq('user_id', user.id);

    if (members?.length) {
      try {
        const { data: authorProfile } = await service.from('profiles').select('full_name').eq('id', user.id).single();
        const notifications = members.map((m: any) => ({
          user_id: m.user_id,
          type: 'group_announcement',
          message: `${authorProfile?.full_name ?? 'Tutor'} posted an announcement in your group.`,
        }));
        await service.from('notifications').insert(notifications);
      } catch {
        // Notifications are non-critical — don't fail the request if they error
      }
    }

    return NextResponse.json({ announcement }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/announcements]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
