// =====================================================
// LIST PAYOUT BATCHES (ADMIN)
// =====================================================

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();
  const { data, error } = await admin
    .from('payout_batches')
    .select('id, generated_at, paid_at, cancelled_at, total_amount_ttd, line_count, status, csv_filename, generated_by')
    .order('generated_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ batches: data ?? [] });
}
