// POST /api/admin/verification-v2/reverify
//   { scope: 'verified' | 'pending' | 'both', reason?, apply?: boolean, limit? }
//   { tutorIds: string[], reason?, apply?: boolean }
//
// Asks teachers to verify again (status REVERIFICATION_REQUIRED). Admin only.
// DRY RUN BY DEFAULT: without `apply: true` it only reports who would change.
// Nothing calls this automatically and it notifies nobody; teachers see the new
// status next time they open the verification page.

import { NextRequest, NextResponse } from 'next/server';
import { requireReverification } from '@/lib/verificationV2/review';
import { guardAdminV2, reviewErrorResponse } from '@/lib/verificationV2/adminGuard';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const g = await guardAdminV2({ decide: true, adminOnly: true });
  if (g.error) return g.error;

  const body = await request.json().catch(() => ({}));
  const scope = body?.scope;
  if (scope !== undefined && !['verified', 'pending', 'both'].includes(scope)) {
    return NextResponse.json({ error: 'scope must be verified, pending or both' }, { status: 400 });
  }
  const tutorIds = Array.isArray(body?.tutorIds) ? body.tutorIds.filter((x: unknown) => typeof x === 'string') : undefined;

  const result = await requireReverification(
    { actor: g.actor, actorId: g.actorId, db: g.db },
    {
      scope,
      tutorIds,
      reason: typeof body?.reason === 'string' ? body.reason : null,
      dryRun: body?.apply !== true,
      limit: typeof body?.limit === 'number' ? body.limit : undefined,
    }
  );
  if ('ok' in result) return reviewErrorResponse(result);
  return NextResponse.json(result);
}
