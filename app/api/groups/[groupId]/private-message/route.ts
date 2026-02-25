import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

// POST /api/groups/[groupId]/private-message
// Creates or retrieves a 1:1 conversation between the student and the group tutor,
// tagged with group_context_id so both parties know it originated from this group.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Validate: user must be an approved member of this group
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
      return NextResponse.json({ error: 'Tutors do not initiate private messages from this endpoint' }, { status: 400 });
    }

    const { data: membership } = await service
      .from('group_members')
      .select('status')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (membership?.status !== 'approved') {
      return NextResponse.json({ error: 'You must be an approved group member to message the tutor' }, { status: 403 });
    }

    // Check for existing conversation between student and tutor for this group
    const { data: existing } = await service
      .from('conversations')
      .select('id')
      .eq('group_context_id', groupId)
      .or(`participant_1_id.eq.${user.id},participant_2_id.eq.${user.id}`)
      .or(`participant_1_id.eq.${group.tutor_id},participant_2_id.eq.${group.tutor_id}`)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ conversationId: existing.id });
    }

    // Create new conversation
    const { data: conversation, error } = await service
      .from('conversations')
      .insert({
        participant_1_id: user.id,
        participant_2_id: group.tutor_id,
        initiated_by_id: user.id,
        group_context_id: groupId,
        status: 'ACCEPTED',
      })
      .select('id')
      .single();

    if (error) throw error;

    // Notify tutor of new private message request
    await service.from('notifications').insert({
      user_id: group.tutor_id,
      type: 'new_message',
      title: 'New private message',
      message: 'A group member has sent you a private message.',
      link: `/tutor/messages/${conversation.id}`,
      related_conversation_id: conversation.id,
    }).catch(() => {});

    return NextResponse.json({ conversationId: conversation.id }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/private-message]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
