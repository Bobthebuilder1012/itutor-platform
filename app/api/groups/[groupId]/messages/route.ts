import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { PostGroupMessageInput } from '@/lib/types/groups';

type Params = { params: Promise<{ groupId: string }> };

async function isApprovedMemberOrTutor(
  service: ReturnType<typeof getServiceClient>,
  groupId: string,
  userId: string
): Promise<boolean> {
  const { data: group } = await service
    .from('groups')
    .select('tutor_id')
    .eq('id', groupId)
    .single();

  if (group?.tutor_id === userId) return true;

  const { data: member } = await service
    .from('group_members')
    .select('status')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();

  return member?.status === 'approved';
}

// GET /api/groups/[groupId]/messages — fetch group message board
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const allowed = await isApprovedMemberOrTutor(service, groupId, user.id);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch top-level messages and replies separately, then merge
    const { data: messages, error } = await service
      .from('group_messages')
      .select(`
        id, group_id, sender_id, parent_message_id, body, is_pinned, is_locked, created_at,
        sender:profiles!group_messages_sender_id_fkey(id, full_name, avatar_url)
      `)
      .eq('group_id', groupId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Build threaded structure: top-level with nested replies
    const allMessages = messages ?? [];
    const topLevel = allMessages.filter((m: any) => !m.parent_message_id);
    const replies = allMessages.filter((m: any) => m.parent_message_id);

    const threaded = topLevel.map((m: any) => ({
      ...m,
      replies: replies.filter((r: any) => r.parent_message_id === m.id),
    }));

    return NextResponse.json({ messages: threaded });
  } catch (err) {
    console.error('[GET /api/groups/[groupId]/messages]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[groupId]/messages — post a new message or reply
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const allowed = await isApprovedMemberOrTutor(service, groupId, user.id);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: PostGroupMessageInput = await request.json();
    if (!body.body?.trim()) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
    }

    // If replying, ensure parent exists and is not locked
    if (body.parent_message_id) {
      const { data: parent } = await service
        .from('group_messages')
        .select('is_locked')
        .eq('id', body.parent_message_id)
        .single();

      if (parent?.is_locked) {
        return NextResponse.json({ error: 'This thread is locked' }, { status: 400 });
      }
    }

    const { data: message, error } = await service
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: user.id,
        parent_message_id: body.parent_message_id ?? null,
        body: body.body.trim(),
      })
      .select(`
        id, group_id, sender_id, parent_message_id, body, is_pinned, is_locked, created_at,
        sender:profiles!group_messages_sender_id_fkey(id, full_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Notify all approved members except the sender
    const { data: members } = await service
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('status', 'approved')
      .neq('user_id', user.id);

    // Also notify tutor if sender is not the tutor
    const { data: group } = await service
      .from('groups')
      .select('tutor_id, name')
      .eq('id', groupId)
      .single();

    const notifyUsers = new Set<string>((members ?? []).map((m: any) => m.user_id));
    if (group && group.tutor_id !== user.id) {
      notifyUsers.add(group.tutor_id);
    }

    if (notifyUsers.size > 0) {
      try {
        await service.from('notifications').insert(
          Array.from(notifyUsers).map((uid) => ({
            user_id: uid,
            type: 'group_new_message',
            title: 'New message in group',
            message: `New message in "${group?.name ?? 'your group'}"`,
            link: `/groups`,
          }))
        );
      } catch {
        // Do not fail message posting if notification insert fails.
      }
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/messages]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
