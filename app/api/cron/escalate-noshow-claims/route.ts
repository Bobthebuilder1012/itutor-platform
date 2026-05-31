// =====================================================
// CRON: ESCALATE EXPIRED NO-SHOW CLAIMS TO ADMIN
// =====================================================
// GET /api/cron/escalate-noshow-claims
// Headers: Authorization: Bearer <CRON_SECRET>
//
// Runs every 15 min (see vercel.json). Flips any noshow_claims in
// 'awaiting_response' state where response_deadline < now() to
// 'pending_admin' so they show up in /admin/disputes. The
// defendant's silence weighs against them in admin review.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getServiceClient();

  const { data: expired, error } = await admin
    .from('noshow_claims')
    .update({ status: 'pending_admin' })
    .eq('status', 'awaiting_response')
    .lt('response_deadline', new Date().toISOString())
    .select('id, claimant_id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort notify claimants that their case advanced.
  if (expired && expired.length > 0) {
    try {
      await admin.from('notifications').insert(
        expired.map((c: any) => ({
          user_id: c.claimant_id,
          type: 'noshow_claim_escalated',
          title: 'No-show claim escalated to admin',
          message:
            'The other party did not respond in time. Your case is now under admin review.',
          link: '/student/bookings',
        }))
      );
    } catch (e) {
      console.error('escalate-noshow-claims: notification insert failed', e);
    }
  }

  return NextResponse.json({
    ok: true,
    escalated_count: expired?.length ?? 0,
  });
}
