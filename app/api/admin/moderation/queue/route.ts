import { NextResponse } from 'next/server';
import { getAuthenticatedUserId, requireAdmin } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const isAdmin = await requireAdmin(userId);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = getServiceClient();

  const { data, error } = await db
    .from('comment_reports')
    .select('*, reporter:reporter_id(id, full_name), resolved_by_profile:resolved_by(id, full_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
