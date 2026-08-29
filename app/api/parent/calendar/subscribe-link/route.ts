// GET  /api/parent/calendar/subscribe-link — the parent's own feed URL
// POST /api/parent/calendar/subscribe-link — rotate it
//
// Separate from the .ics route because these two need opposite things: the feed
// must work with no session, and this must work with nothing BUT a session. A
// single endpoint would have to accept both, and the weaker one would win.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { getOrCreateFeedToken, rotateFeedToken } from '@/lib/server/calendarFeed';

export const dynamic = 'force-dynamic';

function feedUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://myitutor.com').replace(/\/$/, '');
  return `${base}/api/parent/calendar.ics?token=${token}`;
}

export async function GET(_request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();

    // Minted on first view rather than at signup: most parents never subscribe,
    // and a credential that exists for everyone is a larger surface than one that
    // exists for the people using it.
    const token = await getOrCreateFeedToken(admin, parentProfile.id);

    const { data } = await admin
      .from('calendar_feed_tokens')
      .select('created_at, last_used_at')
      .eq('user_id', parentProfile.id)
      .maybeSingle();

    const row = data as { created_at: string; last_used_at: string | null } | null;

    return NextResponse.json({
      url: feedUrl(token),
      createdAt: row?.created_at ?? null,
      // Lets a parent tell "my calendar app never connected" from "it connected
      // and there is nothing to show".
      lastUsedAt: row?.last_used_at ?? null,
    });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/calendar/subscribe-link]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(_request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const token = await rotateFeedToken(admin, parentProfile.id);

    return NextResponse.json({
      url: feedUrl(token),
      rotated: true,
      // Said plainly, because rotation breaks working subscriptions and a parent
      // who does not know that will think the product broke.
      note: 'The old link stops working now. Anywhere you already subscribed needs the new one.',
    });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/calendar/subscribe-link]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
