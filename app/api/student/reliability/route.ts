// =====================================================
// STUDENT RELIABILITY SUMMARY
// =====================================================
// GET /api/student/reliability
//
// Returns the active student strikes, cancellation count + warning
// status. Used by the student dashboard reliability panel.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getStudentCancelState, getStudentStrikeState } from '@/lib/reliability';

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
  const [strikesRes, cancelState, strikeState] = await Promise.all([
    admin
      .from('student_strikes')
      .select(
        'id, reason, notes, issued_at, expires_at, cleared_at, appeal_status, appeal_text, appealed_at, appeal_decided_at, appeal_decision_notes, booking_id, session_id'
      )
      .eq('student_id', user.id)
      .is('cleared_at', null)
      .gt('expires_at', now)
      .order('issued_at', { ascending: false }),

    getStudentCancelState(admin, user.id),
    getStudentStrikeState(admin, user.id),
  ]);

  return NextResponse.json({
    strikes: strikesRes.data ?? [],
    cancel_state: cancelState,
    strike_state: strikeState,
  });
}
