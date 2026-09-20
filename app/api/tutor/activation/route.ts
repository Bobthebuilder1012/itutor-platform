/**
 * The single source of truth for "3 / 5".
 *
 * Both §5's persistent banner and §4's Migration Dashboard read this endpoint.
 * They could each compute the count from the invite list, and then they would
 * drift, and the way that drift shows up is a teacher seeing one number in the
 * header and a different one in the table below it.
 *
 * DELIBERATELY NOT BEHIND requireTeacherActivation(). Turning the feature flag
 * off must stop new invitations being sent; it must not blind a teacher to the
 * ones already in flight, or blank a banner for someone mid-window. The gate
 * belongs on the write routes.
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { authenticateUser, requireTutor } from '@/lib/api/groupAuth';
import { ok, fail } from '@/lib/api/http';
import { isTeacherActivationEnabled } from '@/lib/featureFlags/teacherActivation';
import { isParentAccountsEnabled } from '@/lib/featureFlags/parentAccounts';
import { buildActivationSnapshot } from '@/lib/classInvites/dashboard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    if (!(await requireTutor(user.id))) return fail('Tutor role required', 403);

    const groupId = new URL(request.url).searchParams.get('groupId');
    const admin = getServiceClient();
    const snapshot = await buildActivationSnapshot(admin, user.id, { groupId });

    return ok({
      goal: snapshot.goal,
      rows: snapshot.rows,
      classes: snapshot.classes,
      unavailable: snapshot.unavailable,
      // The client hides the invite tools when this is false, but keeps
      // showing whatever is already in flight.
      canInvite: isTeacherActivationEnabled(),
      // Neither flag carries a NEXT_PUBLIC_ prefix, deliberately, so the
      // browser cannot read them directly. It learns them here instead, which
      // is also what makes flipping one take effect without a rebuild.
      parentAccountsEnabled: isParentAccountsEnabled(),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Internal server error', 500);
  }
}
