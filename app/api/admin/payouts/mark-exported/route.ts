// POST /api/admin/payouts/mark-exported
// Marks tutor_deductions as 'deducted' so they move to CSV history
// and no longer appear in the Unofficial CSV view.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { deduction_ids }: { deduction_ids: string[] } = await req.json().catch(() => ({}));

  if (!Array.isArray(deduction_ids) || deduction_ids.length === 0) {
    return NextResponse.json({ error: 'deduction_ids required' }, { status: 400 });
  }

  const admin = getServiceClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from('tutor_deductions')
    .update({ status: 'deducted', resolved_at: now })
    .in('id', deduction_ids)
    .eq('status', 'pending');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, exported_at: now, count: deduction_ids.length });
}
