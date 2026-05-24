import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const db = getServiceClient();

  const { data: prompt, error: fetchError } = await db
    .from('rating_prompts')
    .select('id, student_id, dismissed_count, status')
    .eq('id', params.id)
    .single();

  if (fetchError || !prompt) {
    return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
  }
  if (prompt.student_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (prompt.status !== 'pending') {
    return NextResponse.json({ error: 'Prompt is not pending' }, { status: 400 });
  }

  const snoozeUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from('rating_prompts')
    .update({
      snoozed_until: snoozeUntil,
      dismissed_count: prompt.dismissed_count + 1,
    })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
