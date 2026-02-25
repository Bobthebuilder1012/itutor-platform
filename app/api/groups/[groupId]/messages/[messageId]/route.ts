import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { PatchGroupMessageInput } from '@/lib/types/groups';

type Params = { params: Promise<{ groupId: string; messageId: string }> };

// PATCH /api/groups/[groupId]/messages/[messageId] — pin or lock (tutor only)
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { groupId, messageId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const { data: group } = await service
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden — only the tutor can pin or lock messages' }, { status: 403 });
    }

    const body: PatchGroupMessageInput = await request.json();
    const updates: Record<string, boolean> = {};
    if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned;
    if (body.is_locked !== undefined) updates.is_locked = body.is_locked;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { data: message, error } = await service
      .from('group_messages')
      .update(updates)
      .eq('id', messageId)
      .eq('group_id', groupId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ message });
  } catch (err) {
    console.error('[PATCH /api/groups/[groupId]/messages/[messageId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[groupId]/messages/[messageId] — delete a message (sender or tutor)
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { groupId, messageId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    const { data: msg } = await service
      .from('group_messages')
      .select('sender_id, group_id')
      .eq('id', messageId)
      .single();

    const { data: group } = await service
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();

    const isSender = msg?.sender_id === user.id;
    const isTutor = group?.tutor_id === user.id;

    if (!isSender && !isTutor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await service
      .from('group_messages')
      .delete()
      .eq('id', messageId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/groups/[groupId]/messages/[messageId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
