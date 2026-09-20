/**
 * The net under teacher activation.
 *
 * fulfilClassInvite is called inline from every path that creates a membership,
 * which is what makes a teacher's count move immediately. But "every path" is a
 * claim that decays: the next payment route, admin tool or import script added
 * to this codebase will write a membership without knowing this feature exists,
 * and its students would silently never be credited.
 *
 * So this sweep asks the question from the other end — for every invitation
 * still open, has the person actually landed in a class? — and it therefore
 * catches writers that have not been written yet. The same argument migration
 * 246 makes for its reconciler: one net beats N hooks nobody can enumerate.
 *
 * Also does the expiry pass, so a stale invitation stops being counted as
 * Invited even if nobody opens the dashboard.
 *
 * NOT GATED ON THE FEATURE FLAG. Turning invitations off must stop new ones
 * being sent; people already mid-flow must still be able to complete, and the
 * numbers must stay honest while they do.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { fulfilClassInvite } from '@/lib/classInvites/fulfil';
import { childrenOf } from '@/lib/classInvites/counting';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Rows examined per run. Generous, but bounded — this is a cron, not a scan. */
const MAX_ROWS = 500;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const nowIso = new Date().toISOString();

    // 1. Expire what has run out. Done first, so the fulfilment pass below is
    //    not spending work on rows nobody can accept any more.
    const { data: expiredRows, error: expireError } = await service
      .from('class_invites')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', nowIso)
      .select('id');

    if (expireError) {
      // A missing table means this environment has not run 257. That is not a
      // failure worth paging anyone about, but it must not report success.
      return NextResponse.json(
        { error: expireError.message, expired: 0, fulfilled: 0 },
        { status: 500 }
      );
    }

    // 2. Close anything whose invitee has since landed in a class.
    //
    //    Only 'accepted' rows are swept: a 'pending' invitation has never been
    //    opened, so there is no account to have joined anything. Someone who
    //    joined without ever clicking is picked up by the inline hook in
    //    performGroupJoin, which matches on the address too.
    const { data: openRows } = await service
      .from('class_invites')
      .select('id, user_id, group_id, joined_student_id')
      .eq('status', 'accepted')
      .not('user_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS);

    const open = (openRows ?? []) as Array<{
      id: string;
      user_id: string | null;
      group_id: string | null;
      joined_student_id: string | null;
    }>;

    let fulfilled = 0;
    for (const row of open) {
      if (!row.user_id) continue;

      // THE CLAIMANT IS NOT ALWAYS THE STUDENT. fulfilClassInvite resolves
      // parents from a child (findOpenInvite walks parent_child_links upwards),
      // which is the direction the inline hook needs: a child joins, and the
      // parent's invitation closes.
      //
      // This sweep runs the other way — it starts from the invitation — so it
      // has to walk down instead. Passing a parent's own id as studentId would
      // ask "is this parent enrolled?", which they never are, and every parent
      // invitation would sit open forever.
      const candidates = [row.user_id, ...(await childrenOf(service, row.user_id))];

      for (const candidate of candidates) {
        const result = await fulfilClassInvite(service, {
          studentId: candidate,
          groupId: row.group_id,
        });
        if (result.fulfilled) {
          fulfilled += 1;
          break;
        }
      }
    }

    return NextResponse.json({
      expired: (expiredRows ?? []).length,
      examined: open.length,
      fulfilled,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
