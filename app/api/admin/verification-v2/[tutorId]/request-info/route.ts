// POST /api/admin/verification-v2/[tutorId]/request-info   { reason, note? }
// "Ask for more information": sends an IN_REVIEW application back to the teacher with a reason
// from lib/verificationV2/reasons.ts. The teacher is told in-app and sees the reason on their
// verification page. Not a rejection: their profile status is unchanged.

import { NextRequest, NextResponse } from 'next/server';
import { requestInfoV2 } from '@/lib/verificationV2/review';
import { guardAdminV2, reviewErrorResponse } from '@/lib/verificationV2/adminGuard';
import { isDecisionReason } from '@/lib/verificationV2/reasons';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { tutorId: string } }) {
  const g = await guardAdminV2({ decide: true });
  if (g.error) return g.error;

  const body = await request.json().catch(() => ({}));
  if (!isDecisionReason(body?.reason)) {
    return NextResponse.json({ error: 'Choose a reason from the list', code: 'reason_invalid' }, { status: 400 });
  }
  const result = await requestInfoV2(
    { actor: g.actor, actorId: g.actorId, db: g.db },
    params.tutorId,
    body.reason,
    typeof body?.note === 'string' ? body.note : null
  );
  if (!result.ok) return reviewErrorResponse(result);
  return NextResponse.json({ ok: true, status: result.to, notification: result.notification });
}
