// POST /api/classes/[id]/invites
// Mints (or returns) the caller's share link for a class.
//
// Rate-limited on the trailing-window pattern from lib/services/aiRateLimit —
// count rows in the last hour rather than keep a counter, which is correct
// across instances with no shared state and self-heals. No other invite
// endpoint in this codebase has any throttle at all; this is the first.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { canInviteToClass, mintShareInvite, classInviteUrl } from '@/lib/server/classInvites';

export const dynamic = 'force-dynamic';

/** Links minted per person per hour. Generous for a human, useless for a script. */
const MINTS_PER_HOUR = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();

    // Not "forbidden" — a stranger asking about a class they cannot invite to
    // learns nothing about whether it exists.
    if (!(await canInviteToClass(admin, params.id, user.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin
      .from('class_invites')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_id', user.id)
      .gte('created_at', since);

    if ((count ?? 0) >= MINTS_PER_HOUR) {
      return NextResponse.json(
        { error: 'Too many invite links created. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const source = typeof body?.source === 'string' ? body.source.slice(0, 40) : null;

    const invite = await mintShareInvite(admin, {
      groupId: params.id,
      inviterId: user.id,
      source,
    });
    if (!invite) return NextResponse.json({ error: 'Could not create invite' }, { status: 500 });

    return NextResponse.json({ token: invite.token, url: classInviteUrl(invite.token) });
  } catch (e: any) {
    console.error('[classInvites] mint failed:', e?.message ?? e);
    return NextResponse.json({ error: 'Could not create invite' }, { status: 500 });
  }
}
