import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createRouteHandlerSupabase } from '@/lib/api/supabaseRouteClient';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  let body: { rejection_reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const reason = typeof body.rejection_reason === 'string' ? body.rejection_reason.trim() : '';
  if (reason.length < 3) {
    return NextResponse.json({ error: 'rejection_reason must be at least 3 characters.' }, { status: 400 });
  }
  if (reason.length > 2000) {
    return NextResponse.json({ error: 'rejection_reason is too long.' }, { status: 400 });
  }

  const supabase = createRouteHandlerSupabase();
  const now = new Date().toISOString();

  const { data: row, error: fetchErr } = await supabase.from('degrees').select('id, status').eq('id', id).single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  if (row.status === 'verified') {
    return NextResponse.json({ error: 'Cannot reject a verified submission' }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from('degrees')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: auth.profile!.id,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', id);

  if (upErr) {
    console.error(upErr);
    return NextResponse.json({ error: 'Failed to reject' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
