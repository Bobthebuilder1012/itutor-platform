// POST /api/admin/verification-v2/[tutorId]/credentials/[credentialId]/reject   { reason, note? }
// Rejects a credential a VERIFIED teacher added later: it is deleted. `reason` is one of the
// fixed plain reasons (lib/verificationV2/reasons.ts). The teacher's status and badge do not change.

import { NextRequest, NextResponse } from 'next/server';
import { rejectCredentialV2 } from '@/lib/verificationV2/review';
import { guardAdminV2, reviewErrorResponse } from '@/lib/verificationV2/adminGuard';
import { isDecisionReason } from '@/lib/verificationV2/reasons';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { tutorId: string; credentialId: string } }) {
  const g = await guardAdminV2({ decide: true });
  if (g.error) return g.error;
  const body = await request.json().catch(() => ({}));
  if (!isDecisionReason(body?.reason)) {
    return NextResponse.json({ error: 'Choose a reason from the list', code: 'reason_invalid' }, { status: 400 });
  }
  const result = await rejectCredentialV2(
    { actor: g.actor, actorId: g.actorId, db: g.db },
    params.tutorId,
    params.credentialId,
    body.reason,
    typeof body?.note === 'string' ? body.note : null
  );
  if (!result.ok) return reviewErrorResponse(result);
  return NextResponse.json({ ok: true, notification: result.notification });
}
