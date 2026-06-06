// GET /api/admin/tutor-commissions
// Returns all tutors with their commission settings (left-joined).

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const admin = getServiceClient();

  const { data: tutors, error: tutorErr } = await admin
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      tutor_commission_settings (
        commission_mode,
        commission_rate,
        is_commission_exception,
        updated_at
      )
    `)
    .eq('role', 'tutor')
    .order('full_name');

  if (tutorErr) {
    return NextResponse.json({ error: tutorErr.message }, { status: 500 });
  }

  const normalized = (tutors ?? []).map((t: any) => {
    const cs = Array.isArray(t.tutor_commission_settings)
      ? (t.tutor_commission_settings[0] ?? null)
      : (t.tutor_commission_settings ?? null);
    return {
      id: t.id,
      full_name: t.full_name,
      email: t.email,
      commission_mode: cs?.commission_mode ?? null,
      commission_rate: cs?.commission_rate ?? null,
      is_commission_exception: cs?.is_commission_exception ?? false,
      updated_at: cs?.updated_at ?? null,
    };
  });

  return NextResponse.json({ tutors: normalized });
}
