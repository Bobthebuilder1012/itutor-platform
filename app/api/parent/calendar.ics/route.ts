// GET /api/parent/calendar.ics?token=… — the subscribe feed.
//
// UNAUTHENTICATED BY NECESSITY. Google, Apple and Outlook fetch this from their
// own servers on a schedule and carry no session cookie, so the token in the URL
// is the whole credential. Everything about this route follows from that:
//
//   * No session is consulted, and none can be.
//   * A bad or unknown token gets an empty calendar, not a 401 and not an error
//     naming the reason. A distinguishable failure turns this into an oracle for
//     testing tokens, and a calendar client shows an empty feed gracefully while
//     it renders an HTTP error as a broken subscription the parent cannot debug.
//   * The response carries no-store. A CDN caching one family's calendar under a
//     path that differs only by query string is exactly the mistake that serves
//     it to the next requester.
//
// The feed is schedule-only. Attendance is deliberately excluded — see the note
// in lib/server/calendarFeed.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { buildIcs, collectFeedEvents, resolveFeedToken } from '@/lib/server/calendarFeed';

export const dynamic = 'force-dynamic';

function calendarResponse(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="itutor-family.ics"',
      // Never cached anywhere shared: the URL is a credential.
      'Cache-Control': 'no-store, private, max-age=0',
    },
  });
}

const EMPTY = buildIcs({ name: 'iTutor', events: [] });

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') ?? '';

    const admin = getServiceClient();
    const userId = await resolveFeedToken(admin, token);

    // Same shape for "no token", "wrong token" and "revoked token". The client
    // subscribes successfully and simply sees nothing.
    if (!userId) return calendarResponse(EMPTY);

    const { events, childCount } = await collectFeedEvents(admin, userId);

    return calendarResponse(
      buildIcs({
        name: childCount === 1 ? 'iTutor classes' : 'iTutor — family classes',
        events,
      })
    );
  } catch (err) {
    console.error('[GET /api/parent/calendar.ics]', err);
    // An error must not surface as a broken subscription either: calendar clients
    // that get a 500 often stop retrying and the parent never finds out.
    return calendarResponse(EMPTY);
  }
}
