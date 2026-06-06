// PUT /api/admin/tutor-commissions/[tutorId]
// Upsert commission settings for a single tutor.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ tutorId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { error, profile } = await requireAdmin();
  if (error) return error;

  const { tutorId } = await params;
  const body = await req.json();
  const { commission_mode, commission_rate, is_commission_exception } = body as {
    commission_mode: string;
    commission_rate: number | null;
    is_commission_exception: boolean;
  };

  if (!['constant', 'reflexive'].includes(commission_mode)) {
    return NextResponse.json({ error: 'Invalid commission mode' }, { status: 400 });
  }
  if (commission_mode === 'constant' && (commission_rate == null || commission_rate < 0)) {
    return NextResponse.json({ error: 'commission_rate required for constant mode' }, { status: 400 });
  }

  const admin = getServiceClient();

  const { error: upsertErr } = await admin
    .from('tutor_commission_settings')
    .upsert(
      {
        tutor_id: tutorId,
        commission_mode,
        commission_rate: commission_mode === 'reflexive' ? null : commission_rate,
        is_commission_exception: is_commission_exception ?? false,
        updated_by: profile!.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tutor_id' }
    );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
