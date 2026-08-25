// =====================================================
// POST /api/events — client event ingestion
// =====================================================
// Find Your iTutor Build Plan §2.4: "Every write carries attribution from the
// cookie."
//
// Clients post an event name and props; this route supplies the identity and
// the attribution. Neither is accepted from the request body — a browser that
// could name its own user_id or forge its attribution would make the whole
// funnel unauditable, and the funnel is what campaign spend is judged on.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, getServerClient } from '@/lib/supabase/server';
import {
  ATTR_COOKIE,
  LAST_COOKIE,
  ANON_COOKIE,
  parseAttribution,
} from '@/lib/analytics/attribution';
import { CLIENT_EMITTABLE } from '@/lib/analytics/events';

export const dynamic = 'force-dynamic';

/** Guards against a runaway client loop filling the table. */
const MAX_BATCH = 20;
const MAX_PROPS_BYTES = 8_000;

interface IncomingEvent {
  event?: unknown;
  props?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const incoming: IncomingEvent[] = Array.isArray(body)
    ? (body as IncomingEvent[])
    : [body as IncomingEvent];

  if (incoming.length === 0) {
    return NextResponse.json({ written: 0 });
  }
  if (incoming.length > MAX_BATCH) {
    return NextResponse.json({ error: `At most ${MAX_BATCH} events per request` }, { status: 400 });
  }

  // Identity comes from the session cookie, never from the body.
  let userId: string | null = null;
  try {
    const supabase = await getServerClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  // Attribution comes from the httpOnly cookie middleware wrote, never from
  // the body. First touch preferred, last touch as fallback.
  const attrCookie = request.cookies.get(ATTR_COOKIE)?.value;
  const lastCookie = request.cookies.get(LAST_COOKIE)?.value;
  const attribution = parseAttribution(attrCookie) ?? parseAttribution(lastCookie);
  const anonId = request.cookies.get(ANON_COOKIE)?.value ?? null;

  const rows: Array<{
    user_id: string | null;
    anon_id: string | null;
    event: string;
    props: Record<string, unknown>;
    attribution: unknown;
  }> = [];

  for (const item of incoming) {
    const name = typeof item?.event === 'string' ? item.event : null;

    // Reject unknown names outright. Silently accepting a typo'd event is
    // worse than a 400: it looks like it worked and the data never arrives
    // where the query expects it.
    if (!name || !CLIENT_EMITTABLE.has(name)) {
      return NextResponse.json(
        { error: `Event '${name ?? '(missing)'}' is not client-emittable` },
        { status: 400 }
      );
    }

    const props = isPlainObject(item.props) ? item.props : {};
    if (JSON.stringify(props).length > MAX_PROPS_BYTES) {
      return NextResponse.json({ error: 'props too large' }, { status: 413 });
    }

    rows.push({
      user_id: userId,
      anon_id: anonId,
      event: name,
      props,
      attribution,
    });
  }

  try {
    const service = getServiceClient();
    const { error } = await service.from('product_events').insert(rows);
    if (error) {
      console.error('[api/events] insert failed:', error.message);
      // 202: the client should not retry or surface anything to the user.
      // A measurement gap must never become a visible failure.
      return NextResponse.json({ written: 0, degraded: true }, { status: 202 });
    }
  } catch (err) {
    console.error('[api/events] insert threw:', err);
    return NextResponse.json({ written: 0, degraded: true }, { status: 202 });
  }

  return NextResponse.json({ written: rows.length });
}
