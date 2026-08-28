/**
 * Rename and archive one conversation.
 *
 * PATCH is what the history panel's inline rename calls. The ownership check is
 * explicit rather than left to RLS, because this route uses the service client
 * (which bypasses RLS) and an unchecked update here would let any signed-in
 * tutor rename any other tutor's conversation by guessing a uuid.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Long enough for a real title, short enough not to break the panel's layout. */
const MAX_TITLE_LENGTH = 120;

async function requireOwnership(conversationId: string) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data } = await getServiceClient()
    .from('ai_conversations')
    .select('id, user_id')
    .eq('id', conversationId)
    .maybeSingle();

  // Same 404 whether it does not exist or belongs to someone else — a
  // distinguishable response would confirm which uuids are real.
  if (!data || data.user_id !== user.id) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }

  return { userId: user.id };
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireOwnership(params.id);
  if (check.error) return check.error;

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    status?: string;
  };

  const patch: Record<string, string> = {};

  if (typeof body.title === 'string') {
    const title = body.title.trim().slice(0, MAX_TITLE_LENGTH);
    // An empty rename is a slip. Ignoring it leaves the old title, which is
    // what the tutor would want; applying it would erase the row's only label.
    if (title) patch.title = title;
  }

  if (body.status === 'ARCHIVED' || body.status === 'ACTIVE') {
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await getServiceClient()
    .from('ai_conversations')
    .update(patch)
    .eq('id', params.id)
    .select('id, title, task_type, status, last_message_at')
    .single();

  if (error) {
    console.error('[ai/conversations] update failed:', error.message);
    return NextResponse.json({ error: 'Could not update the conversation' }, { status: 500 });
  }

  return NextResponse.json({ conversation: data });
}
