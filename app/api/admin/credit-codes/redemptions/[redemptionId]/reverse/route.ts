// POST /api/admin/credit-codes/redemptions/[redemptionId]/reverse {reason}
// Take back one code redemption. Only what is left of those credits can be
// clawed back; anything already spent is reported, never driven negative.
// A written reason of at least 10 characters is required; audited.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';
import { requireCreditAdmin } from '@/lib/credits/adminAccess';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ redemptionId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { error, admin: actor } = await requireCreditAdmin({ write: true });
  if (error) return error;
  const { redemptionId } = await params;

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10) return NextResponse.json({ error: 'Give a reason of at least 10 characters' }, { status: 400 });

  const service = getServiceClient();
  const { data, error: rpcErr } = await service.rpc('reverse_credit_redemption', {
    p_redemption_id: redemptionId,
    p_admin: actor.id,
    p_reason: reason,
  });
  if (rpcErr) {
    const status = rpcErr.message.startsWith('redemption_not_found') ? 404 : 500;
    return NextResponse.json({ error: rpcErr.message }, { status });
  }

  await logAdminAction(
    { id: actor.id, email: actor.email },
    { action: 'credits.redemption.reverse', targetType: 'credit_redemption', targetId: redemptionId, reason, details: data ?? {} }
  );
  return NextResponse.json({ ok: true, result: data });
}
