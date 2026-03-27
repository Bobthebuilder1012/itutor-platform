import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createRouteHandlerSupabase } from '@/lib/api/supabaseRouteClient';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const supabase = createRouteHandlerSupabase();
  const now = new Date().toISOString();

  const { data: row, error: fetchErr } = await supabase.from('degrees').select('id, status').eq('id', id).single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  if (row.status === 'verified') {
    return NextResponse.json({ error: 'Already verified' }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from('degrees')
    .update({
      status: 'verified',
      rejection_reason: null,
      reviewed_by: auth.profile!.id,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', id);

  if (upErr) {
    console.error(upErr);
    return NextResponse.json({ error: 'Failed to approve' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
