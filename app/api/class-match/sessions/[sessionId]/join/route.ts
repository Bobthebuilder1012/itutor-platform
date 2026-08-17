import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { issueCouponForJoin } from '@/lib/classMatchWeek/coupons';
import type { ClassMatchSession } from '@/lib/classMatchWeek/types';

type Params = { params: Promise<{ sessionId: string }> };
export const dynamic = 'force-dynamic';

// GET /api/class-match/sessions/[sessionId]/join — the join button's href.
//
// This is the campaign's attendance metric AND its coupon trigger
// (docs 03 §3.4). Responses:
//   401 — not signed in
//   403 — no 'reserved' reservation for this user on this session
//   404 — unknown session
//   409 { error: 'no_meet_link' } — published without a room (should be
//         impossible; the mint-before-publish contract exists to prevent it)
//   410 — session cancelled: "no longer running". This is the documented
//         cancellation floor — the Meet link may still exist in Google's
//         calendar and cannot be revoked, but the platform must never be the
//         thing that directs a family to an empty room.
//   302 — redirect to the session's Meet link
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { sessionId } = await params;

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();

    const { data: sessionData } = await service
      .from('class_match_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    const session = sessionData as ClassMatchSession | null;
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // A live 'reserved' row is the ticket. Cancelled reservations lost it.
    const { data: reservation } = await service
      .from('class_match_reservations')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .eq('status', 'reserved')
      .maybeSingle();
    if (!reservation) {
      return NextResponse.json({ error: 'not_reserved' }, { status: 403 });
    }

    if (session.status === 'cancelled') {
      return NextResponse.json(
        { error: 'cancelled', message: 'This session is no longer running.' },
        { status: 410 }
      );
    }

    if (!session.meet_link) {
      return NextResponse.json({ error: 'no_meet_link' }, { status: 409 });
    }

    // Record the join click BEFORE anything else can fail. The row means
    // "opened the session link" — it is NOT attendance and must never be
    // reported as attendance (docs 03 §3.4); clicked_at lets a truthful
    // in-window number be derived later. ignoreDuplicates on the
    // UNIQUE(session_id, user_id) makes a second click a no-op, so refreshing
    // the tab neither errors nor double-counts.
    const { error: clickError } = await service
      .from('class_match_join_clicks')
      .upsert(
        { session_id: sessionId, user_id: user.id },
        { onConflict: 'session_id,user_id', ignoreDuplicates: true }
      );
    if (clickError) {
      // Loud but non-blocking: a family standing at the door beats a
      // bookkeeping write. This log line is the only trace — watch for it.
      console.error('[GET class-match/join] join click write failed', clickError);
    }

    // Coupon issuance is best-effort AFTER the click write: a failure here
    // must never block the redirect to class. It is idempotent per
    // (user, class), so the retry is simply the next click.
    try {
      await issueCouponForJoin(service, { session, userId: user.id });
    } catch (err) {
      console.error('[GET class-match/join] coupon issuance failed', err);
    }

    return NextResponse.redirect(session.meet_link, 302);
  } catch (err) {
    console.error('[GET class-match/sessions/[sessionId]/join]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
