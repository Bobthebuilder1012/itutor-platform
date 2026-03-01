import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; sessionId: string }> };

// PATCH /api/groups/[groupId]/sessions/[sessionId] — edit a session title/time
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { groupId, sessionId } = await params;
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.start_time !== undefined) updates.start_time = body.start_time;
    if (body.duration_minutes !== undefined) updates.duration_minutes = body.duration_minutes;
    if (body.ends_on !== undefined) updates.ends_on = body.ends_on;

    const { data: session, error } = await service
      .from('group_sessions')
      .update(updates)
      .eq('id', sessionId)
      .eq('group_id', groupId)
      .select()
      .single();

    if (error) throw error;

    // Notify approved members of schedule change
    const { data: members } = await service
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('status', 'approved');

    if (members && members.length > 0) {
      try {
        await service.from('notifications').insert(
          members.map((m: any) => ({
            user_id: m.user_id,
            type: 'group_session_updated',
            title: 'Group session updated',
            message: `A session schedule has been updated in your group.`,
            link: `/groups`,
          }))
        );
      } catch {
        // Do not fail session update if notification insert fails.
      }
    }

    return NextResponse.json({ session });
  } catch (err) {
    console.error('[PATCH /api/groups/[groupId]/sessions/[sessionId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[groupId]/sessions/[sessionId] — delete a session and all occurrences
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { groupId, sessionId } = await params;
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await service
      .from('group_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('group_id', groupId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/groups/[groupId]/sessions/[sessionId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
