import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; sessionId: string; occurrenceId: string }> };

// DELETE /api/groups/[groupId]/sessions/[sessionId]/occurrences/[occurrenceId] — cancel one occurrence
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { groupId, sessionId, occurrenceId } = await params;
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
      .from('group_session_occurrences')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', occurrenceId)
      .eq('group_session_id', sessionId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE occurrence]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
