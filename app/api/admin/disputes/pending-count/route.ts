// =====================================================
// ADMIN DISPUTES PENDING COUNT
// =====================================================
// GET /api/admin/disputes/pending-count
//
// Cheap summary endpoint used by the admin dashboard badge.
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

  const [claims, warnings, ratingAppeals, tutorStrikeAppeals, studentStrikeAppeals] =
    await Promise.all([
      admin
        .from('noshow_claims')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_admin'),
      admin
        .from('reliability_warnings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_admin'),
      admin
        .from('ratings')
        .select('id', { count: 'exact', head: true })
        .eq('system_issued', true)
        .eq('appeal_status', 'pending'),
      admin
        .from('tutor_strikes')
        .select('id', { count: 'exact', head: true })
        .eq('appeal_status', 'pending'),
      admin
        .from('student_strikes')
        .select('id', { count: 'exact', head: true })
        .eq('appeal_status', 'pending'),
    ]);

  const noshow = claims.count ?? 0;
  const reliabilityWarnings = warnings.count ?? 0;
  const ratingAppealsCount = ratingAppeals.count ?? 0;
  const strikeAppealsCount = (tutorStrikeAppeals.count ?? 0) + (studentStrikeAppeals.count ?? 0);

  return NextResponse.json({
    noshow,
    warnings: reliabilityWarnings,
    rating_appeals: ratingAppealsCount,
    strike_appeals: strikeAppealsCount,
    total: noshow + reliabilityWarnings + ratingAppealsCount + strikeAppealsCount,
  });
}
