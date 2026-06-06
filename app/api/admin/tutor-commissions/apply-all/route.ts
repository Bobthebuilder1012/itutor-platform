// POST /api/admin/tutor-commissions/apply-all
// Applies the global commission setting to every non-exception tutor.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const { error, profile } = await requireAdmin();
  if (error) return error;

  const admin = getServiceClient();

  // Fetch global settings
  const { data: global, error: globalErr } = await admin
    .from('global_commission_settings')
    .select('commission_mode, commission_rate')
    .limit(1)
    .single();

  if (globalErr || !global) {
    return NextResponse.json({ error: 'Global commission settings not found' }, { status: 400 });
  }

  // All tutors
  const { data: tutors, error: tutorErr } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'tutor');

  if (tutorErr) {
    return NextResponse.json({ error: tutorErr.message }, { status: 500 });
  }

  if (!tutors || tutors.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  // Exception set
  const { data: exceptions } = await admin
    .from('tutor_commission_settings')
    .select('tutor_id')
    .eq('is_commission_exception', true);

  const exceptionSet = new Set((exceptions ?? []).map((e: any) => e.tutor_id));

  const toUpdate = tutors.filter((t: any) => !exceptionSet.has(t.id));
  if (toUpdate.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const now = new Date().toISOString();
  const rows = toUpdate.map((t: any) => ({
    tutor_id: t.id,
    commission_mode: global.commission_mode,
    commission_rate: global.commission_mode === 'reflexive' ? null : global.commission_rate,
    is_commission_exception: false,
    updated_by: profile!.id,
    updated_at: now,
  }));

  const { error: upsertErr } = await admin
    .from('tutor_commission_settings')
    .upsert(rows, { onConflict: 'tutor_id' });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: rows.length });
}
