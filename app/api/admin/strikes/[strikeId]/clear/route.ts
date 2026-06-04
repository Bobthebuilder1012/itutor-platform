// =====================================================
// ADMIN: CLEAR A TUTOR STRIKE
// =====================================================
// POST /api/admin/strikes/:strikeId/clear
// Body: { note?: string }
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { strikeId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { note } = (await request.json().catch(() => ({}))) as { note?: string };

  const admin = getServiceClient();

  const { data: strike } = await admin
    .from('tutor_strikes')
    .select('id, tutor_id, cleared_at')
    .eq('id', params.strikeId)
    .maybeSingle();
  if (!strike) return NextResponse.json({ error: 'Strike not found' }, { status: 404 });
  if (strike.cleared_at) {
    return NextResponse.json({ error: 'Strike already cleared' }, { status: 409 });
  }

  const { error: updateError } = await admin
    .from('tutor_strikes')
    .update({
      cleared_at: new Date().toISOString(),
      cleared_by: auth.user!.id,
      cleared_note: note?.trim() || null,
    })
    .eq('id', strike.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
