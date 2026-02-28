import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

// PATCH /api/groups/[groupId]/announcements/[announcementId]
// Tutor can edit body, toggle pin
export async function PATCH(
  req: NextRequest,
  { params }: { params: { groupId: string; announcementId: string } }
) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    const { groupId, announcementId } = params;

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Only the tutor can edit announcements' }, { status: 403 });
    }

    const { body, is_pinned } = await req.json();
    const updates: Record<string, unknown> = {};
    if (typeof body === 'string') { updates.body = body.trim(); updates.edited_at = new Date().toISOString(); }
    if (typeof is_pinned === 'boolean') updates.is_pinned = is_pinned;

    const { data: announcement, error } = await service
      .from('group_announcements')
      .update(updates)
      .eq('id', announcementId)
      .eq('group_id', groupId)
      .select(`id, body, is_pinned, edited_at, created_at, author:profiles!group_announcements_author_id_fkey(id, full_name, avatar_url)`)
      .single();

    if (error) throw error;

    return NextResponse.json({ announcement });
  } catch (err) {
    console.error('[PATCH /api/groups/announcements/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[groupId]/announcements/[announcementId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { groupId: string; announcementId: string } }
) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    const { groupId, announcementId } = params;

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Only the tutor can delete announcements' }, { status: 403 });
    }

    const { error } = await service
      .from('group_announcements')
      .delete()
      .eq('id', announcementId)
      .eq('group_id', groupId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/groups/announcements/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
