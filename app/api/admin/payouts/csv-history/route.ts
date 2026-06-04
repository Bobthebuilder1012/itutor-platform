// GET /api/admin/payouts/csv-history?type=lesson|one_on_one
// Returns exported tutor_deductions grouped by resolved_at date.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const type = req.nextUrl.searchParams.get('type') ?? 'lesson'; // 'lesson' | 'one_on_one'
  const admin = getServiceClient();

  let query = admin
    .from('tutor_deductions')
    .select('id, tutor_id, amount_ttd, reason, resolved_at, source_enrollment_id, source_subscription_payment_id, source_payment_id')
    .eq('status', 'deducted')
    .not('resolved_at', 'is', null)
    .order('resolved_at', { ascending: false })
    .limit(200);

  if (type === 'lesson') {
    query = query.or('source_enrollment_id.not.is.null,source_subscription_payment_id.not.is.null');
  } else {
    // one_on_one: session-based or manual (no enrollment/subscription link)
    query = query.is('source_enrollment_id', null).is('source_subscription_payment_id', null);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by resolved_at date
  const byDate = new Map<string, { date: string; total_ttd: number; count: number; tutor_ids: Set<string> }>();
  for (const d of data ?? []) {
    const date = d.resolved_at ? d.resolved_at.slice(0, 10) : 'unknown';
    const existing = byDate.get(date);
    if (existing) {
      existing.total_ttd += Number(d.amount_ttd ?? 0);
      existing.count += 1;
      existing.tutor_ids.add(d.tutor_id);
    } else {
      byDate.set(date, { date, total_ttd: Number(d.amount_ttd ?? 0), count: 1, tutor_ids: new Set([d.tutor_id]) });
    }
  }

  const history = Array.from(byDate.values())
    .map(({ date, total_ttd, count, tutor_ids }) => ({
      date,
      total_ttd: Math.round(total_ttd * 100) / 100,
      deduction_count: count,
      tutor_count: tutor_ids.size,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({ history });
}
