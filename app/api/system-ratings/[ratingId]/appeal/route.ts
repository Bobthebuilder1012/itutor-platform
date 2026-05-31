// =====================================================
// FILE A SYSTEM-RATING APPEAL
// =====================================================
// POST /api/system-ratings/:ratingId/appeal
// Body: { appealText: string }
//
// The tutor whose profile carries an auto-issued 1-star or 2-star
// system rating can appeal. Sets appeal_status='pending' and queues
// the row for admin review at /admin/disputes.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { ratingId: string } }
) {
  try {
    const { appealText } = (await request.json()) as { appealText?: string };
    if (typeof appealText !== 'string' || appealText.trim().length < 20) {
      return NextResponse.json(
        { error: 'appealText must be at least 20 characters' },
        { status: 400 }
      );
    }

    const serverClient = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    if (rating.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!rating.system_issued) {
      return NextResponse.json(
        { error: 'Only system-issued ratings can be appealed' },
        { status: 400 }
      );
    }
    if (rating.appeal_status === 'pending') {
      return NextResponse.json(
        { error: 'An appeal is already in review' },
        { status: 409 }
      );
    }
    if (rating.appeal_status === 'overturned' || rating.appeal_status === 'upheld') {
      return NextResponse.json(
        { error: `Appeal already ${rating.appeal_status}` },
        { status: 409 }
      );
    }

    const { error: updateError } = await admin
      .from('ratings')
      .update({
        appeal_status: 'pending',
        appeal_text: appealText.trim(),
        appealed_at: new Date().toISOString(),
      })
      .eq('id', rating.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, appeal_status: 'pending' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to file appeal' },
      { status: 500 }
    );
  }
}
