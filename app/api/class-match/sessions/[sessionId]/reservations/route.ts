import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ sessionId: string }> };
export const dynamic = 'force-dynamic';

/** One reserved seat, as the teacher's list needs it. */
export type SessionReservation = {
  /** Display name, or a neutral stand-in when the profile has none. */
  name: string;
  role: string | null;
  /** ISO — when the seat was taken. */
  reservedAt: string;
  /** Has this person opened the join link? NOT attendance (see below). */
  joinClicked: boolean;
};

// GET /api/class-match/sessions/[sessionId]/reservations
//
// Who has reserved a taster, for the teacher about to teach it. A teacher
// walking into a free session with strangers should know how many people to
// expect and what to call them.
//
// OWNERSHIP IS THE WHOLE GATE: tutor_id on the session must be the caller.
// Anything else 404s rather than 403s, so this endpoint confirms nothing about
// which session ids exist to someone guessing at them.
//
// WHAT IT DELIBERATELY DOES NOT RETURN: email addresses. The teacher needs to
// recognise the family in the room, not to contact them outside the platform,
// and the campaign collects email as the only contact channel precisely because
// it is the platform's to use. Admin export (docs 04 §4.6) is where
// contactable data belongs.
//
// `joinClicked` means the person opened the join link. It is NOT attendance and
// must never be labelled as such — the copy in the UI says "opened the link"
// for the same reason the table comment does.
//
//   401 — not signed in
//   404 — unknown session, or one this teacher does not own
//   200 { reservations }
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { sessionId } = await params;

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();

    const { data: session } = await service
      .from('class_match_sessions')
      .select('id, tutor_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (!session || session.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Live seats only. A cancelled reservation freed its place and its holder is
    // not coming; showing them would inflate the number the teacher plans for.
    const { data: rows, error } = await service
      .from('class_match_reservations')
      .select('user_id, created_at')
      .eq('session_id', sessionId)
      .eq('status', 'reserved')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[GET class-match/reservations] reservation read failed', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const userIds = (rows ?? []).map((r) => r.user_id as string);
    if (userIds.length === 0) return NextResponse.json({ reservations: [] });

    // Two reads rather than a join: PostgREST embedding across these tables
    // needs a declared foreign-key relationship it does not have to profiles
    // under the service role's search path, and the seat count per session is
    // small enough that the round trip is cheaper than the schema work.
    const [{ data: profiles }, { data: clicks }] = await Promise.all([
      service.from('profiles').select('id, full_name, display_name, role').in('id', userIds),
      service.from('class_match_join_clicks').select('user_id').eq('session_id', sessionId),
    ]);

    const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
    const clicked = new Set((clicks ?? []).map((c) => c.user_id as string));

    const reservations: SessionReservation[] = (rows ?? []).map((r) => {
      const p = byId.get(r.user_id as string);
      return {
        // display_name first — it is what the person chose to be called, and the
        // profile may carry no full name at all on a campaign-only signup.
        name: (p?.display_name || p?.full_name || 'iTutor member') as string,
        role: (p?.role ?? null) as string | null,
        reservedAt: r.created_at as string,
        joinClicked: clicked.has(r.user_id as string),
      };
    });

    return NextResponse.json({ reservations });
  } catch (err) {
    console.error('[GET class-match/sessions/[sessionId]/reservations]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
