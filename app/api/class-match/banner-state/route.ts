import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getSubmissionByToken, getSubmissionForUser } from '@/lib/classMatchWeek/portalData';
import { listUserReservations } from '@/lib/classMatchWeek/reservations';

export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'cmw_token';

// GET /api/class-match/banner-state — the one cheap payload the site-wide
// banner needs to pick its message:
//   { hasSubmission, authed, nextSession, joined, started }
//
// hasSubmission is true only when the cookie's submission row carries all
// three matching inputs (level + subjects + availability) — a half-finished
// questionnaire should still be prompted to finish, not congratulated.
// nextSession is the soonest upcoming session the signed-in user holds a
// 'reserved' seat on. No caching: this drives per-visitor copy.
//
// `joined` and `started` are ACCOUNT-aware, which hasSubmission deliberately is
// not: the site banner keys off the cookie because it also serves anonymous
// visitors, but a signed-in student's dashboard must not invite them to join
// something they already finished on another device or before the cookie
// expired. Both identities are checked and either one counts.
export async function GET() {
  try {
    const service = getServiceClient();

    const token = cookies().get(COOKIE_NAME)?.value ?? '';
    const submission = token ? await getSubmissionByToken(service, token) : null;
    const hasSubmission = Boolean(
      submission &&
        submission.level &&
        (submission.subjects?.length ?? 0) > 0 &&
        (submission.availability?.length ?? 0) > 0
    );

    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const authed = Boolean(user);

    // Either identity counts. The cookie is what an anonymous visitor has; the
    // account is what survives a cleared cookie or a different device.
    const accountSubmission = user ? await getSubmissionForUser(service, user.id) : null;
    const joined = Boolean(submission?.completed_at || accountSubmission?.completed_at);
    const started = Boolean(submission || accountSubmission) && !joined;

    let nextSession: null | { sessionId: string; title: string; scheduledAt: string } = null;
    if (user) {
      const reservations = await listUserReservations(service, user.id);
      const now = Date.now();
      // listUserReservations is ordered soonest-first, so the first live
      // future row is the answer. Cancelled sessions are skipped — a banner
      // must never count down to a class that is not happening.
      const upcoming = reservations.find(
        (r) =>
          r.status === 'reserved' &&
          r.session.status !== 'cancelled' &&
          new Date(r.session.scheduled_at).getTime() > now
      );
      if (upcoming) {
        nextSession = {
          sessionId: upcoming.session_id,
          title: upcoming.session.title,
          scheduledAt: upcoming.session.scheduled_at,
        };
      }
    }

    return NextResponse.json({ hasSubmission, authed, nextSession, joined, started });
  } catch (err) {
    console.error('[GET class-match/banner-state]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
