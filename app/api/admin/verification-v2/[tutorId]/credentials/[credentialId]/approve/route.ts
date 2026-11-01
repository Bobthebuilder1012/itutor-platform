// POST /api/admin/verification-v2/[tutorId]/credentials/[credentialId]/approve
// Approves a credential a VERIFIED teacher added later. It becomes public; the teacher's status
// and badge do not change.

import { NextRequest, NextResponse } from 'next/server';
import { approveCredentialV2 } from '@/lib/verificationV2/review';
import { guardAdminV2, reviewErrorResponse } from '@/lib/verificationV2/adminGuard';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { tutorId: string; credentialId: string } }) {
  const g = await guardAdminV2({ decide: true });
  if (g.error) return g.error;
  const result = await approveCredentialV2({ actor: g.actor, actorId: g.actorId, db: g.db }, params.tutorId, params.credentialId);
  if (!result.ok) return reviewErrorResponse(result);
  return NextResponse.json({ ok: true, notification: result.notification });
}
