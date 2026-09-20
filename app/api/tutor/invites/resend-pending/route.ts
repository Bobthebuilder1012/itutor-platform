/**
 * "Resend pending" — one press, every invitation that is genuinely waiting.
 *
 * NAMES THE SKIPS. The response lists what was not sent and why, because a
 * teacher who presses this and sees "sent 6" when they can count 8 pending
 * rows concludes the button is broken. Telling them two were reminded
 * recently is the difference between a limit and a bug.
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { authenticateUser } from '@/lib/api/groupAuth';
import { ok, fail } from '@/lib/api/http';
import { requireTeacherActivation } from '@/lib/classInvites/guard';
import { deliverClassInvite } from '@/lib/services/classInvite';
import { INVITE_COLUMNS } from '@/lib/classInvites/fulfil';
import { MAX_BULK_RESEND, BATCH_SEND_DELAY_MS } from '@/lib/classInvites/limits';
import { resendBlockedReason } from '@/lib/classInvites/resend';
import type { ClassInviteRow } from '@/lib/classInvites/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const gate = await requireTeacherActivation(user.id);
    if (!gate.ok) return gate.response;

    const body = (await request.json().catch(() => ({}))) as { groupId?: string | null };
    const admin = getServiceClient();

    let query = admin
      .from('class_invites')
      .select(INVITE_COLUMNS)
      .eq('tutor_id', user.id)
      .in('status', ['pending', 'failed'])
      .order('created_at', { ascending: true })
      .limit(MAX_BULK_RESEND);
    if (body.groupId) query = query.eq('group_id', body.groupId);

    const { data } = await query;
    const invites = ((data ?? []) as unknown as ClassInviteRow[]).filter(Boolean);

    if (invites.length === 0) {
      return ok({ resent: 0, skipped: [], message: 'Nothing is waiting for a reminder.' });
    }

    const { data: tutorData } = await admin
      .from('profiles')
      .select('full_name, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const tutor = tutorData as { full_name: string | null; display_name: string | null } | null;
    const tutorName = tutor?.display_name || tutor?.full_name || 'Your teacher';

    // Class names once, not once per invitation.
    const groupIds = Array.from(
      new Set(invites.map((i) => i.group_id).filter(Boolean) as string[])
    );
    const classNameById = new Map<string, string | null>();
    if (groupIds.length) {
      const { data: groups } = await admin.from('groups').select('id, name').in('id', groupIds);
      for (const g of (groups ?? []) as Array<{ id: string; name: string | null }>) {
        classNameById.set(g.id, g.name);
      }
    }

    const skipped: Array<{ inviteId: string; email: string; reason: string }> = [];
    let resent = 0;

    for (const invite of invites) {
      const blocked = resendBlockedReason(invite);
      if (blocked) {
        skipped.push({ inviteId: invite.id, email: invite.invitee_email, reason: blocked });
        continue;
      }

      const outcome = await deliverClassInvite(admin, invite, {
        tutorName,
        className: invite.group_id ? classNameById.get(invite.group_id) ?? null : null,
      });

      if (outcome.state === 'send_failed') {
        skipped.push({
          inviteId: invite.id,
          email: invite.invitee_email,
          reason: outcome.error ?? 'That did not send',
        });
      } else {
        resent += 1;
      }

      await new Promise((r) => setTimeout(r, BATCH_SEND_DELAY_MS));
    }

    return ok({ resent, skipped });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Internal server error', 500);
  }
}
