// =====================================================
// ADMIN DISPUTES OVERVIEW
// =====================================================
// GET /api/admin/disputes
//
// Returns the four queues the /admin/disputes page renders:
//   1. noshow_claims with status='pending_admin'
//   2. reliability_warnings with status='pending_admin'
//   3. tutors at >= 5 active strikes (suspension candidates)
//   4. ratings.appeal_status='pending'
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  const [claims, warnings, appeals, strikeRows] = await Promise.all([
    admin
      .from('noshow_claims')
      .select(
        'id, session_id, booking_id, claimant_id, claimant_role, defendant_id, evidence_files, evidence_type, written_explanation, defendant_response, defendant_evidence_files, defendant_responded_at, response_deadline, status, created_at'
      )
      .eq('status', 'pending_admin')
      .order('created_at', { ascending: true })
      .limit(100),

    admin
      .from('reliability_warnings')
      .select('id, user_id, user_role, flag_reason, trigger_count, flagged_at, status, created_at')
      .eq('status', 'pending_admin')
      .order('flagged_at', { ascending: true })
      .limit(100),

    admin
      .from('ratings')
      .select('id, tutor_id, stars, system_issued, system_reason, appeal_status, appeal_text, appealed_at, session_id, created_at')
      .eq('system_issued', true)
      .eq('appeal_status', 'pending')
      .order('appealed_at', { ascending: true })
      .limit(100),

    admin
      .from('tutor_strikes')
      .select('tutor_id')
      .is('cleared_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(5000),
  ]);

  // Aggregate strike counts client-side from the raw rows; the query
  // would otherwise need a HAVING clause that Postgrest doesn't expose.
  const strikeCounts = new Map<string, number>();
  for (const row of strikeRows.data || []) {
    strikeCounts.set((row as any).tutor_id, (strikeCounts.get((row as any).tutor_id) || 0) + 1);
  }
  const suspensionCandidates: { tutor_id: string; active_strikes: number }[] = [];
  for (const [tutorId, count] of strikeCounts.entries()) {
    if (count >= 5) suspensionCandidates.push({ tutor_id: tutorId, active_strikes: count });
  }

  // Resolve participant + session names for the dispute cards.
  const userIds = new Set<string>();
  for (const c of claims.data || []) {
    userIds.add((c as any).claimant_id);
    userIds.add((c as any).defendant_id);
  }
  for (const w of warnings.data || []) userIds.add((w as any).user_id);
  for (const a of appeals.data || []) userIds.add((a as any).tutor_id);
  for (const s of suspensionCandidates) userIds.add(s.tutor_id);

  const profiles =
    userIds.size > 0
      ? (
          await admin
            .from('profiles')
            .select('id, full_name, display_name, username, email')
            .in('id', Array.from(userIds))
        ).data || []
      : [];
  const profileMap = new Map<string, any>(profiles.map((p: any) => [p.id, p]));

  const sessionIds = Array.from(new Set((claims.data || []).map((c: any) => c.session_id).filter(Boolean)));
  const sessions =
    sessionIds.length > 0
      ? (
          await admin
            .from('sessions')
            .select('id, scheduled_start_at, charge_amount_ttd')
            .in('id', sessionIds)
        ).data || []
      : [];
  const sessionMap = new Map<string, any>(sessions.map((s: any) => [s.id, s]));

  return NextResponse.json({
    noshow_claims: (claims.data || []).map((c: any) => ({
      ...c,
      claimant: profileMap.get(c.claimant_id) || null,
      defendant: profileMap.get(c.defendant_id) || null,
      session: sessionMap.get(c.session_id) || null,
    })),
    warnings: (warnings.data || []).map((w: any) => ({
      ...w,
      user: profileMap.get(w.user_id) || null,
    })),
    appeals: (appeals.data || []).map((a: any) => ({
      ...a,
      tutor: profileMap.get(a.tutor_id) || null,
    })),
    suspension_candidates: suspensionCandidates.map((s) => ({
      ...s,
      tutor: profileMap.get(s.tutor_id) || null,
    })),
  });
}
