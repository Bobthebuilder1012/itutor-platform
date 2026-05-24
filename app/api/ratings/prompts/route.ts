import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const db = getServiceClient();

  const { data, error } = await db
    .from('rating_prompts')
    .select('*, groups(id, name)')
    .eq('student_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .or(`snoozed_until.is.null,snoozed_until.lt.${new Date().toISOString()}`)
    .order('available_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
