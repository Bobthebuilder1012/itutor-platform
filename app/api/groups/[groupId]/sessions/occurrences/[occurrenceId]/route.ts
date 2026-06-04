import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; occurrenceId: string }> };

export const dynamic = 'force-dynamic';

// DELETE — cancel (delete) a single session occurrence
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { groupId, occurrenceId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Verify the tutor owns this group
    const { data: group } = await service
      .from('groups')
      .select('tutor_id, name')
      .eq('id', groupId)
      .single();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Try deleting as an occurrence first
    const { data: occurrence } = await service
      .from('group_session_occurrences')
      .select('id')
      .eq('id', occurrenceId)
      .maybeSingle();

    if (occurrence) {
      const { error } = await service
        .from('group_session_occurrences')
        .delete()
        .eq('id', occurrenceId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // Fallback: the ID is a group_sessions.id (session with no occurrences yet)
    const { data: session } = await service
      .from('group_sessions')
      .select('id, group_id')
      .eq('id', occurrenceId)
      .eq('group_id', groupId)
      .maybeSingle();

    if (session) {
      const { error } = await service
        .from('group_sessions')
        .delete()
        .eq('id', occurrenceId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  } catch (err) {
    console.error('[DELETE /api/groups/[groupId]/sessions/occurrences/[occurrenceId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
