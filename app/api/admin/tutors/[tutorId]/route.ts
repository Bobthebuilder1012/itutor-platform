// PATCH /api/admin/tutors/[tutorId]
// Set a tutor's marketplace promotion: admin_boost (0–100 nudge),
// pin_rank (null = unpinned, else explicit 1-based position) and an
// optional note. Stamps admin_boost_updated_at/by. Service-role write —
// the profiles trigger (mig 190) blocks any non-service-role caller.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ tutorId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error, profile } = await requireAdmin();
  if (error) return error;

  const { tutorId } = await params;
  const body = await req.json().catch(() => ({}));
  const { admin_boost, pin_rank, admin_boost_note } = body as {
    admin_boost?: number;
    pin_rank?: number | null;
    admin_boost_note?: string | null;
  };

  const update: Record<string, unknown> = {
    admin_boost_updated_at: new Date().toISOString(),
    admin_boost_updated_by: profile!.id,
  };

  if (admin_boost !== undefined) {
    const b = Number(admin_boost);
    if (!Number.isInteger(b) || b < 0 || b > 100) {
      return NextResponse.json({ error: 'admin_boost must be an integer 0–100' }, { status: 400 });
    }
    update.admin_boost = b;
  }

  if (pin_rank !== undefined) {
    if (pin_rank === null || (pin_rank as unknown) === '') {
      update.pin_rank = null;
    } else {
      const p = Number(pin_rank);
      if (!Number.isInteger(p) || p < 1) {
        return NextResponse.json({ error: 'pin_rank must be null or an integer ≥ 1' }, { status: 400 });
      }
      update.pin_rank = p;
    }
  }

  if (admin_boost_note !== undefined) {
    update.admin_boost_note = admin_boost_note ? String(admin_boost_note).slice(0, 500) : null;
  }

  const admin = getServiceClient();
  const { error: upErr } = await admin
    .from('profiles')
    .update(update)
    .eq('id', tutorId)
    .eq('role', 'tutor');

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
