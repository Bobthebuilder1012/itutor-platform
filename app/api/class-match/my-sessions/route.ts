import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getLiveCampaign } from '@/lib/classMatchWeek/portalData';
import { listUserReservations } from '@/lib/classMatchWeek/reservations';

export const dynamic = 'force-dynamic';

/** A taster this person is holding a place at, as the join card needs it. */
export type MyCampaignSession = {
  sessionId: string;
  title: string;
  groupId: string;
  groupName: string;
  teacherName: string;
  /** ISO timestamp of the session start. */
  scheduledAt: string;
  durationMinutes: number;
};

// GET /api/class-match/my-sessions — the caller's still-to-come tasters.
//
// This exists so the join button can live on the student and parent dashboards,
// not only inside the campaign portal. Reminder emails go out 24 hours and 1
// hour ahead and the platform is where a family looks in between; before this,
// the only Join button on the site was two navigations deep inside
// /class-match-week, which is a lot of clicking for the one tap the whole
// campaign is judged on.
//
// Cancelled reservations, cancelled sessions and sessions that have already
// finished are all excluded — everything returned here is something the caller
// can still attend. Soonest first.
//
//   200 { sessions: [] } — not signed in, no campaign, or nothing reserved.
//
// Note the 200-with-empty-list for an anonymous caller rather than a 401: this
// is polled by a card that renders on every dashboard load, and a 401 in the
// console on every signed-out visit is noise that hides real failures.
export async function GET() {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ sessions: [] });

    const service = getServiceClient();

    // Honours the kill switch: no live campaign means no join card, the same
    // way it means no countdown and no banner.
    const campaign = await getLiveCampaign(service);
    if (!campaign) return NextResponse.json({ sessions: [] });

    const reservations = await listUserReservations(service, user.id);
    const nowMs = Date.now();

    const sessions: MyCampaignSession[] = reservations
      .filter((r) => r.status === 'reserved' && r.session.status !== 'cancelled')
      .filter((r) => {
        const startMs = new Date(r.session.scheduled_at).getTime();
        if (!Number.isFinite(startMs)) return false;
        // Still joinable until the session's own end, not its start — someone
        // ten minutes late is still going to class.
        return startMs + r.session.duration_minutes * 60_000 > nowMs;
      })
      .sort((a, b) => a.session.scheduled_at.localeCompare(b.session.scheduled_at))
      .map((r) => ({
        sessionId: r.session.id,
        title: r.session.title,
        groupId: r.session.group_id,
        groupName: r.session.groupName,
        teacherName: r.session.teacherName,
        scheduledAt: r.session.scheduled_at,
        durationMinutes: r.session.duration_minutes,
      }));

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error('[GET class-match/my-sessions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
