// =====================================================
// ADMIN: DECIDE STRIKE APPEAL
// =====================================================
// POST /api/admin/strikes/:strikeId/decide-appeal
// Body: {
//   decision: 'upheld' | 'overturned',
//   kind: 'tutor' | 'student',
//   notes?: string,
// }
//
// Upheld   = strike remains active.
// Overturned = strike is cleared (cleared_at set, drops from active count).
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

  const { decision, kind, notes } = (await request.json()) as {
    decision?: 'upheld' | 'overturned';
    kind?: 'tutor' | 'student';
    notes?: string;
  };

  if (decision !== 'upheld' && decision !== 'overturned') {
    return NextResponse.json(
      { error: "decision must be 'upheld' or 'overturned'" },
      { status: 400 }
    );
  }
  if (kind !== 'tutor' && kind !== 'student') {
    return NextResponse.json(
      { error: "kind must be 'tutor' or 'student'" },
      { status: 400 }
    );
  }

  const table = kind === 'tutor' ? 'tutor_strikes' : 'student_strikes';
  const ownerCol = kind === 'tutor' ? 'tutor_id' : 'student_id';

  const admin = getServiceClient();

  const { data: strike } = await admin
    .from(table)
    .select(`id, ${ownerCol}, appeal_status, cleared_at`)
    .eq('id', params.strikeId)
    .maybeSingle();

  if (!strike) {
    return NextResponse.json({ error: 'Strike not found' }, { status: 404 });
  }
  if ((strike as any).appeal_status !== 'pending') {
    return NextResponse.json(
      { error: 'No pending appeal to decide on this strike' },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    appeal_status: decision,
    appeal_decided_by: auth.user!.id,
    appeal_decided_at: now,
    appeal_decision_notes: notes?.trim() || null,
  };
  if (decision === 'overturned' && !(strike as any).cleared_at) {
    update.cleared_at = now;
    update.cleared_by = auth.user!.id;
    update.cleared_note = `Cleared via appeal: ${notes?.trim() || 'overturned by admin'}`;
  }

  const { error: updateError } = await admin
    .from(table)
    .update(update)
    .eq('id', (strike as any).id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  try {
    await admin.from('notifications').insert({
      user_id: (strike as any)[ownerCol],
      type: 'strike_appeal_decided',
      title: decision === 'overturned' ? 'Appeal upheld' : 'Appeal denied',
      message:
        decision === 'overturned'
          ? 'Your strike appeal was upheld. The strike has been cleared from your record.'
          : 'Your strike appeal was reviewed. The strike remains in place.',
      link: kind === 'tutor' ? '/tutor/dashboard' : '/student/dashboard',
    });
  } catch (e) {
    console.error('admin/strikes/decide-appeal: notification insert failed', e);
  }

  return NextResponse.json({ success: true, appeal_status: decision });
}
