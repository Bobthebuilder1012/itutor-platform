/**
 * Sending a reminder for one invitation.
 *
 * THE SAME TOKEN, a longer expiry — copying the parent-invite resend. Minting
 * a new token would silently break the link in the first email, which is the
 * one the invitee is most likely to still have.
 *
 * The limits refuse in words a teacher can act on. A bare 429 becomes "Failed"
 * in a toast, and the teacher retries, and nothing ever explains why.
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { authenticateUser } from '@/lib/api/groupAuth';
import { ok, fail } from '@/lib/api/http';
import { requireTeacherActivation } from '@/lib/teacherInvites/guard';
import { deliverClassInvite } from '@/lib/services/classInvite';
import { INVITE_COLUMNS } from '@/lib/teacherInvites/fulfil';
import { INVITE_TTL_DAYS } from '@/lib/teacherInvites/limits';
import { resendBlockedReason } from '@/lib/teacherInvites/resend';
import type { ClassInviteRow } from '@/lib/teacherInvites/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ inviteId: string }> };

export async function POST(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const gate = await requireTeacherActivation(user.id);
    if (!gate.ok) return gate.response;

    const { inviteId } = await params;
    const admin = getServiceClient();

    const { data } = await admin
      .from('teacher_invites')
      .select(INVITE_COLUMNS)
      .eq('id', inviteId)
      .eq('tutor_id', user.id)
      .maybeSingle();

    const invite = (data as unknown as ClassInviteRow | null) ?? null;
    if (!invite) return fail('Invitation not found', 404);

    const blocked = resendBlockedReason(invite);
    if (blocked) return fail(blocked, 429);

    const { data: tutorData } = await admin
      .from('profiles')
      .select('full_name, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const tutor = tutorData as { full_name: string | null; display_name: string | null } | null;

    let className: string | null = null;
    if (invite.group_id) {
      const { data: g } = await admin
        .from('groups')
        .select('name')
        .eq('id', invite.group_id)
        .maybeSingle();
      className = (g as { name: string | null } | null)?.name ?? null;
    }

    // A reminder restarts the clock. Otherwise an invitation sent 29 days ago
    // is reminded today and expires tomorrow.
    await admin
      .from('teacher_invites')
      .update({
        expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
        // A previous send failure is being retried, so it is pending again.
        ...(invite.status === 'failed' ? { status: 'pending' as const } : {}),
      })
      .eq('id', invite.id);

    const outcome = await deliverClassInvite(admin, invite, {
      tutorName: tutor?.display_name || tutor?.full_name || 'Your teacher',
      className,
    });

    if (outcome.state === 'send_failed') {
      return fail(outcome.error ?? 'That did not send', 502);
    }

    return ok({
      sentAt: new Date().toISOString(),
      sendCount: invite.send_count + 1,
      state: outcome.state,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Internal server error', 500);
  }
}
