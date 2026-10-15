// POST /api/admin/verification-v2/[tutorId]/reject   { reason }
// Rejects an IN_REVIEW application. A reason is required. A teacher who is
// already VERIFIED stays verified: only revoke takes that away.

import { NextRequest, NextResponse } from 'next/server';
import { rejectV2 } from '@/lib/verificationV2/review';
import { guardAdminV2, reviewErrorResponse } from '@/lib/verificationV2/adminGuard';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { tutorId: string } }) {
  const g = await guardAdminV2({ decide: true });
  if (g.error) return g.error;

  const body = await request.json().catch(() => ({}));
  const result = await rejectV2(
    { actor: g.actor, actorId: g.actorId, db: g.db },
    params.tutorId,
    typeof body?.reason === 'string' ? body.reason : ''
  );
  if (!result.ok) return reviewErrorResponse(result);
  return NextResponse.json({ ok: true, status: result.to, profile: result.profile, redaction: result.redaction });
}
