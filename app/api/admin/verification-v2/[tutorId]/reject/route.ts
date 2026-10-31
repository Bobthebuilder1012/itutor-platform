// POST /api/admin/verification-v2/[tutorId]/reject   { reason, note? }
// Rejects an IN_REVIEW application. `reason` must be one of lib/verificationV2/reasons.ts; `note`
// is optional, internal and never shown to the teacher. A teacher who is
// already VERIFIED stays verified: only revoke takes that away.

import { NextRequest, NextResponse } from 'next/server';
import { rejectV2 } from '@/lib/verificationV2/review';
import { guardAdminV2, reviewErrorResponse } from '@/lib/verificationV2/adminGuard';
import { isDecisionReason } from '@/lib/verificationV2/reasons';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { tutorId: string } }) {
  const g = await guardAdminV2({ decide: true });
  if (g.error) return g.error;

  const body = await request.json().catch(() => ({}));
  // Only the fixed list of plain reasons. Free text goes in `note` and stays internal.
  if (!isDecisionReason(body?.reason)) {
    return NextResponse.json({ error: 'Choose a reason from the list', code: 'reason_invalid' }, { status: 400 });
  }
  const result = await rejectV2(
    { actor: g.actor, actorId: g.actorId, db: g.db },
    params.tutorId,
    body.reason,
    typeof body?.note === 'string' ? body.note : null
  );
  if (!result.ok) return reviewErrorResponse(result);
  return NextResponse.json({ ok: true, status: result.to, profile: result.profile, redaction: result.redaction });
}
