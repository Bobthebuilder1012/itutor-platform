// POST /api/admin/verification-v2/[tutorId]/revoke   { reason }
// Takes verified status away. Admin role only (config/verificationPolicy.ts). A
// revoked teacher cannot resubmit through any flow.

import { NextRequest, NextResponse } from 'next/server';
import { revokeV2 } from '@/lib/verificationV2/review';
import { guardAdminV2, reviewErrorResponse } from '@/lib/verificationV2/adminGuard';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { tutorId: string } }) {
  // adminOnly here AND in the transition map: the map is the rule, this is the early 403.
  const g = await guardAdminV2({ decide: true, adminOnly: true });
  if (g.error) return g.error;

  const body = await request.json().catch(() => ({}));
  const result = await revokeV2(
    { actor: g.actor, actorId: g.actorId, db: g.db },
    params.tutorId,
    typeof body?.reason === 'string' ? body.reason : ''
  );
  if (!result.ok) return reviewErrorResponse(result);
  return NextResponse.json({ ok: true, status: result.to, profile: result.profile, redaction: result.redaction });
}
