// =====================================================
// ADMIN: DECIDE SYSTEM RATING APPEAL
// =====================================================
// POST /api/admin/system-ratings/:ratingId/decide-appeal
// Body: { decision: 'upheld' | 'overturned', notes?: string }
//
// Upheld   = the rating stands; appeal_status='upheld', is_active stays true.
// Overturned = the rating is dropped from the tutor's overall average;
//              appeal_status='overturned', is_active=false.
// The public reviews API filters on is_active so the change is reflected
// in the next fetch.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { ratingId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { decision, notes } = (await request.json()) as {
    decision?: 'upheld' | 'overturned';
    notes?: string;
  };

  if (decision !== 'upheld' && decision !== 'overturned') {
    return NextResponse.json(
      { error: "decision must be 'upheld' or 'overturned'" },
      { status: 400 }
    );
  }

  const admin = getServiceClient();

  const { data: rating } = await admin
    .from('ratings')
    .select('id, tutor_id, system_issued, appeal_status')
    .eq('id', params.ratingId)
    .maybeSingle();

  if (!rating) {
    return NextResponse.json({ error: 'Rating not found' }, { status: 404 });
  }
  if (!rating.system_issued) {
    return NextResponse.json(
      { error: 'Only system-issued ratings can be appealed' },
      { status: 400 }
    );
  }
  if (rating.appeal_status !== 'pending') {
    return NextResponse.json(
      { error: 'No pending appeal to decide on this rating' },
      { status: 409 }
    );
  }

  const { error: updateError } = await admin
    .from('ratings')
    .update({
      appeal_status: decision,
      appeal_decided_by: auth.user!.id,
      appeal_decided_at: new Date().toISOString(),
      appeal_decision_notes: notes?.trim() || null,
      is_active: decision === 'overturned' ? false : true,
    })
    .eq('id', rating.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  try {
    await admin.from('notifications').insert({
      user_id: rating.tutor_id,
      type: 'rating_appeal_decided',
      title: decision === 'overturned' ? 'Appeal upheld' : 'Appeal denied',
      message:
        decision === 'overturned'
          ? 'Your appeal was upheld. The system-issued rating has been removed from your profile.'
          : 'Your appeal was reviewed. The system-issued rating remains in place.',
      link: '/tutor/reviews',
    });
  } catch (e) {
    console.error('decide-appeal: notification insert failed', e);
  }

  return NextResponse.json({ success: true, appeal_status: decision });
}
