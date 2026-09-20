/**
 * Withdrawing an invitation.
 *
 * NEVER A HARD DELETE. The row is the only record that this teacher mailed
 * this address, and that record is the audit trail for a feature which lets a
 * verified tutor send mail from our domain to people who never asked for it.
 * Deleting on request would mean the one action worth reviewing is the one
 * action that erases itself.
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { authenticateUser } from '@/lib/api/groupAuth';
import { ok, fail } from '@/lib/api/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ inviteId: string }> };

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const { inviteId } = await params;
    const admin = getServiceClient();

    // Scoped by tutor_id in the same statement as the write, so ownership is
    // not a separate check that a later refactor can drop.
    const { data, error } = await admin
      .from('class_invites')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', inviteId)
      .eq('tutor_id', user.id)
      // An invitation that already produced a student is not withdrawable:
      // the student is in the class, and pretending otherwise would take a
      // teacher's own count away from them.
      .in('status', ['pending', 'accepted', 'failed', 'expired'])
      .select('id')
      .maybeSingle();

    if (error) return fail(error.message, 500);
    if (!data) return fail('That invitation cannot be withdrawn', 404);

    return ok({ revoked: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Internal server error', 500);
  }
}
