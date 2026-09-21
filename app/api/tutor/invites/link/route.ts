/**
 * The shareable class link.
 *
 * Minted lazily and then stable: reopening the share sheet returns the same
 * URL rather than a new one, so a link already pasted into a WhatsApp group
 * keeps working. A teacher who has shared a link and then sees a different one
 * has no way to tell which of the two is live.
 *
 * WHY THIS AND NOT /r/[code]. A referral code would be the obvious reuse, but
 * campaign_codes has no migration on any branch — /r/ tolerates its absence by
 * marking every code 'unvalidated', which is exactly the state that cannot be
 * attributed to a teacher. This link resolves against a column that exists.
 *
 * The row is not created here. Nobody has been invited yet; a link is an open
 * door, not an addressed envelope. recordLinkArrival() writes a row at the
 * moment a real person signs up through it, when the address is finally known
 * — which is also what keeps the Invited count honest, since a count that
 * included links would count doors rather than people.
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { authenticateUser, requireGroupOwner } from '@/lib/api/groupAuth';
import { ok, fail } from '@/lib/api/http';
import { requireTeacherActivation } from '@/lib/teacherInvites/guard';
import { mintInviteToken } from '@/lib/teacherInvites/token';
import { classLinkUrl } from '@/lib/teacherInvites/links';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const gate = await requireTeacherActivation(user.id);
    if (!gate.ok) return gate.response;

    const body = (await request.json().catch(() => ({}))) as { groupId?: string };
    const groupId = body.groupId?.trim();
    if (!groupId) return fail('Which class?', 400);
    if (!(await requireGroupOwner(groupId, user.id))) return fail('Forbidden', 403);

    const admin = getServiceClient();
    const { data } = await admin
      .from('groups')
      .select('id, name, invite_link_token, archived_at')
      .eq('id', groupId)
      .maybeSingle();

    const group = data as {
      id: string;
      name: string | null;
      invite_link_token: string | null;
      archived_at: string | null;
    } | null;
    if (!group) return fail('Class not found', 404);
    if (group.archived_at) return fail('That class is archived', 409);

    let token = group.invite_link_token;
    if (!token) {
      token = mintInviteToken();
      const { error } = await admin
        .from('groups')
        .update({ invite_link_token: token })
        // Guarded so two tabs minting at once cannot leave the second
        // overwriting a link the first has already handed out.
        .eq('id', groupId)
        .is('invite_link_token', null);

      if (error) return fail(error.message, 500);

      const { data: fresh } = await admin
        .from('groups')
        .select('invite_link_token')
        .eq('id', groupId)
        .maybeSingle();
      token = (fresh as { invite_link_token: string | null } | null)?.invite_link_token ?? token;
    }

    return ok({
      token,
      // Absolute, and built here rather than in the component: the client must
      // never assemble this URL, both because the production host is fixed and
      // because QrCodePanel already hardcodes it in a second place.
      url: classLinkUrl(token),
      className: group.name,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Internal server error', 500);
  }
}
