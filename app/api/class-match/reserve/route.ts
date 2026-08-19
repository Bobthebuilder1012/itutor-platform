import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { findClash, reservedCount } from '@/lib/classMatchWeek/reservations';
import type { ClassMatchSession } from '@/lib/classMatchWeek/types';

export const dynamic = 'force-dynamic';

/** Trinidad wall-clock display for the confirmation copy — never UTC, never
 * the (wrong, always-'UTC') groups.timezone column. */
function trinidadDisplay(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Port_of_Spain',
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Port_of_Spain',
  });
  return `${date} at ${time}`;
}

// POST /api/class-match/reserve — { sessionId, confirm?: boolean }
//
// The one tap the whole campaign exists to produce (docs 03). Responses:
//   401                              — not signed in; the client sends the
//                                      visitor to /class-match-week/signup
//   404                              — unknown session, unpublished session,
//                                      or a campaign that is not live
//   409 { error: 'full' }            — capacity reached
//   409 { error: 'already_reserved' }— duplicate tap; the client treats it
//                                      as success
//   409 { error: 'clash', clash }    — overlaps an existing reservation and
//                                      confirm !== true
//   201 { reservation, confirmation }
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    const { sessionId, confirm } = body as Record<string, unknown>;
    if (typeof sessionId !== 'string' || !sessionId) {
      return NextResponse.json({ error: 'invalid_field', field: 'sessionId' }, { status: 400 });
    }

    const service = getServiceClient();

    // Published sessions of a live campaign only. A draft, a cancelled
    // session, or a session from an ended campaign must not be reservable
    // even by a URL someone saved — all of those 404 identically, so this
    // endpoint confirms nothing about which ids exist.
    const { data: sessionData } = await service
      .from('class_match_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    const session = sessionData as ClassMatchSession | null;

    if (!session || session.status !== 'published') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: campaign } = await service
      .from('class_match_campaigns')
      .select('status')
      .eq('id', session.campaign_id)
      .maybeSingle();
    if (!campaign || campaign.status !== 'live') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Capacity. NULL max_attendees is unlimited; otherwise only 'reserved'
    // rows hold seats, so cancellations free them. 'full' is terminal for
    // now — the join queue ("Notify me") is Phase 5, not this endpoint.
    if (session.max_attendees !== null) {
      const taken = await reservedCount(service, session.id);
      if (taken >= session.max_attendees) {
        return NextResponse.json({ error: 'full' }, { status: 409 });
      }
    }

    // Clash check across everything the user holds (exclude nothing).
    // Warn-and-let-proceed is the documented rule (docs 03 §3.3): the family
    // may genuinely want both, but they must not discover the overlap on the
    // day and hand a teacher a no-show that was not their fault. confirm:true
    // is the client's re-POST after showing the warning.
    const clash = await findClash(service, {
      userId: user.id,
      scheduledAt: session.scheduled_at,
      durationMinutes: session.duration_minutes,
    });
    if (clash && confirm !== true) {
      return NextResponse.json({ error: 'clash', clash }, { status: 409 });
    }

    const { data: reservation, error: insertError } = await service
      .from('class_match_reservations')
      .insert({ session_id: session.id, user_id: user.id, status: 'reserved' })
      .select()
      .single();

    if (insertError) {
      // UNIQUE(session_id, user_id) — a duplicate tap, or a re-reserve after
      // cancelling. Either way the seat question is already settled.
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'already_reserved' }, { status: 409 });
      }
      throw insertError;
    }

    // Confirmation copy inputs (docs 03 §3.3): "You will meet <teacher> for
    // "<title>" on <Trinidad wall-clock>."
    const { data: profile } = await service
      .from('profiles')
      .select('display_name, full_name')
      .eq('id', session.tutor_id)
      .maybeSingle();
    const teacherName =
      (profile as { display_name: string | null; full_name: string | null } | null)
        ?.display_name ||
      (profile as { display_name: string | null; full_name: string | null } | null)?.full_name ||
      'iTutor teacher';

    return NextResponse.json(
      {
        reservation,
        confirmation: {
          teacherName,
          title: session.title,
          scheduledAtDisplay: trinidadDisplay(session.scheduled_at),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST class-match/reserve]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
