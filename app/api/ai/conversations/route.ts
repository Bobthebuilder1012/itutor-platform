/**
 * Conversation list and creation for the history panel.
 *
 * Rule 1: nothing here calls a model. Creating a conversation is a row insert;
 * the work a conversation eventually describes goes through `ai_jobs` and the
 * cron worker. This route exists so the history panel has something real to
 * read, and so a conversation can be titled from its first exchange rather than
 * left with a timestamp for a name.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TASK_TYPES = ['LESSON_PLAN', 'QUIZ', 'STUDY_SHEET', 'MARKING', 'GENERAL'] as const;
type TaskType = (typeof TASK_TYPES)[number];

async function requireUser() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RLS on ai_conversations already restricts to the owner; the explicit filter
  // is here so a policy change can never silently widen this endpoint.
  const { data, error } = await getServiceClient()
    .from('ai_conversations')
    .select('id, title, task_type, artifact_type, artifact_id, status, last_message_at')
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE')
    .order('last_message_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[ai/conversations] list failed:', error.message);
    return NextResponse.json({ error: 'Could not load history' }, { status: 500 });
  }

  return NextResponse.json({ conversations: data ?? [] });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    task_type?: string;
    title?: string;
  };

  const taskType: TaskType = TASK_TYPES.includes(body.task_type as TaskType)
    ? (body.task_type as TaskType)
    : 'GENERAL';

  // A conversation with no title yet gets the flow's name, not a timestamp.
  // Auto-titling from the first exchange replaces this as soon as there is one.
  const title = body.title?.trim() || 'New conversation';

  const { data, error } = await getServiceClient()
    .from('ai_conversations')
    .insert({ user_id: user.id, task_type: taskType, title })
    .select('id, title, task_type, last_message_at')
    .single();

  if (error) {
    console.error('[ai/conversations] create failed:', error.message);
    return NextResponse.json({ error: 'Could not start a conversation' }, { status: 500 });
  }

  return NextResponse.json({ conversation: data }, { status: 201 });
}
