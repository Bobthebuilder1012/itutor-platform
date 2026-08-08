// PATCH /api/admin/marketplace/classes/[groupId]
// One class's promotion: admin_boost (0–100 nudge), pin_rank (null = unpinned,
// else an explicit 1-based position) and an optional note. Mirrors
// /api/admin/tutors/[tutorId], one level down.
//
// Service-role write — the groups trigger (mig 215, corrected in 216) refuses
// these columns for every other role.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ groupId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error, profile } = await requireAdmin();
  if (error) return error;

  const { groupId } = await params;
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

  const { data: before } = await admin
    .from('groups')
    .select('id, name, admin_boost, pin_rank, archived_at')
    .eq('id', groupId)
    .maybeSingle();

  if (!before) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if ((before as any).archived_at) {
    return NextResponse.json({ error: 'That class is archived and is not in the marketplace' }, { status: 409 });
  }

  const { error: upErr } = await admin.from('groups').update(update).eq('id', groupId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await logAdminAction(
    { id: profile!.id, email: profile!.email },
    {
      action: 'marketplace.class.promote',
      targetType: 'group',
      targetId: groupId,
      targetLabel: (before as any).name ?? null,
      details: {
        from: { admin_boost: (before as any).admin_boost, pin_rank: (before as any).pin_rank },
        to: {
          admin_boost: update.admin_boost ?? (before as any).admin_boost,
          pin_rank: 'pin_rank' in update ? update.pin_rank : (before as any).pin_rank,
        },
      },
      reason: (update.admin_boost_note as string | null) ?? null,
    }
  );

  return NextResponse.json({ ok: true });
}
