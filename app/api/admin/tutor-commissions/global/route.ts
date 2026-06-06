// GET  /api/admin/tutor-commissions/global  — fetch platform-wide default
// PUT  /api/admin/tutor-commissions/global  — update platform-wide default

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const admin = getServiceClient();
  const { data, error: dbErr } = await admin
    .from('global_commission_settings')
    .select('id, commission_mode, commission_rate, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

export async function PUT(req: NextRequest) {
  const { error, profile } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { commission_mode, commission_rate } = body as {
    commission_mode: string;
    commission_rate: number | null;
  };

  if (!['constant', 'reflexive'].includes(commission_mode)) {
    return NextResponse.json({ error: 'Invalid commission mode' }, { status: 400 });
  }
  if (commission_mode === 'constant' && (commission_rate == null || commission_rate <= 0)) {
    return NextResponse.json({ error: 'commission_rate required for constant mode' }, { status: 400 });
  }

  const admin = getServiceClient();
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from('global_commission_settings')
    .select('id')
    .limit(1)
    .single();

  if (existing) {
    const { error: upErr } = await admin
      .from('global_commission_settings')
      .update({
        commission_mode,
        commission_rate: commission_mode === 'reflexive' ? null : commission_rate,
        updated_by: profile!.id,
        updated_at: now,
      })
      .eq('id', existing.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  } else {
    const { error: insErr } = await admin
      .from('global_commission_settings')
      .insert({
        commission_mode,
        commission_rate: commission_mode === 'reflexive' ? null : commission_rate,
        updated_by: profile!.id,
      });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
