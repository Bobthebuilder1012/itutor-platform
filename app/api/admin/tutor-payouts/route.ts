// GET /api/admin/tutor-payouts
//
// Lesson (group class) earnings grouped by tutor, with each tutor's monthly
// payout date and urgency, sorted overdue → due soon → not due. Also returns
// the lesson batches generated but not yet confirmed paid.
//
// Account numbers are masked server-side; the full number only ever leaves
// the server inside a generated CSV.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { loadTeacherPayouts } from '@/lib/payouts/teacherPayouts';
import { DUE_SOON_DAYS } from '@/lib/payouts/payoutCycle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  try {
    const data = await loadTeacherPayouts(getServiceClient());
    return NextResponse.json({ ...data, due_soon_days: DUE_SOON_DAYS });
  } catch (err: any) {
    console.error('[GET /api/admin/tutor-payouts]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to load payouts' }, { status: 500 });
  }
}
