// =====================================================
// TUTOR RELIABILITY SUMMARY
// =====================================================
// GET /api/tutor/reliability
//
// Returns the active strikes + system-issued ratings on this tutor's
// account, plus current strike state for the dashboard panel.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getTutorStrikeState } from '@/lib/reliability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: NextRequest) {
  const serverClient = await getServerClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getServiceClient();

  const now = new Date().toISOString();
  const [strikesRes, ratingsRes, state] = await Promise.all([
    admin
      .from('tutor_strikes')
      .select(
        'id, reason, notes, issued_at, expires_at, cleared_at, appeal_status, appeal_text, appealed_at, appeal_decided_at, appeal_decision_notes, booking_id, session_id'
      )
      .eq('tutor_id', user.id)
      .is('cleared_at', null)
      .gt('expires_at', now)
      .order('issued_at', { ascending: false }),

    admin
      .from('ratings')
      .select(
        'id, stars, system_issued, system_reason, is_active, appeal_status, appeal_text, appealed_at, appeal_decided_at, appeal_decision_notes, session_id, created_at'
      )
      .eq('tutor_id', user.id)
      .eq('system_issued', true)
      .order('created_at', { ascending: false }),

    getTutorStrikeState(admin, user.id),
  ]);

  return NextResponse.json({
    strikes: strikesRes.data ?? [],
    system_ratings: ratingsRes.data ?? [],
    strike_state: state,
  });
}
