// POST /api/admin/verification-v2/[tutorId]/approve
// Approves an IN_REVIEW application. Needs a passed Stripe identity check and at
// least one credential. Moves the application and the teacher to VERIFIED,
// records the decision, then redacts the Stripe session. Sends nothing.

import { NextResponse } from 'next/server';
import { approveV2 } from '@/lib/verificationV2/review';
import { guardAdminV2, reviewErrorResponse } from '@/lib/verificationV2/adminGuard';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { tutorId: string } }) {
  const g = await guardAdminV2({ decide: true });
  if (g.error) return g.error;

  const result = await approveV2({ actor: g.actor, actorId: g.actorId, db: g.db }, params.tutorId);
  if (!result.ok) return reviewErrorResponse(result);
  return NextResponse.json({ ok: true, status: result.to, profile: result.profile, redaction: result.redaction });
}
