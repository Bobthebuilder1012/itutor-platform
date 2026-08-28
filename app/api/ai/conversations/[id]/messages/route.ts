/**
 * The transcript for one conversation.
 *
 * Read-only. Messages are written by the chat route as they stream, so there is
 * no POST here — a client that could insert assistant turns directly could put
 * words in the model's mouth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = getServiceClient();

  const { data: conversation } = await service
    .from('ai_conversations')
    .select('id, user_id, title, task_type, artifact_type, artifact_id')
    .eq('id', params.id)
    .maybeSingle();

  // Same 404 for missing and not-yours, so uuids cannot be probed.
  if (!conversation || conversation.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: messages } = await service
    .from('ai_messages')
    .select('id, role, content, structured_payload, created_at')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });

  const { user_id: _omit, ...safe } = conversation;
  return NextResponse.json({ conversation: safe, messages: messages ?? [] });
}
