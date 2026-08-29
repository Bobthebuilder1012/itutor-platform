// GET /api/bookings/my-requests — the student's own view of what they asked for.
//
// Handover §9.2: the pending section lives in My Classes, not on the dashboard,
// and it carries the withdraw action and the expired state.
//
// Expiry is the reason this endpoint exists at all. §4.2 sends no email when a
// request lapses, so this list and the parent's Past decisions are the ONLY
// places a student can discover that nobody answered in time. A student who is
// never shown it simply waits for a class that was never going to happen.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { formatWhen } from '@/lib/server/bookingRequestContext';

export const dynamic = 'force-dynamic';

/** Terminal states worth showing back. Approved ones become real classes and
 *  appear in the list below this section, so they are not repeated here. */
const RECENT_OUTCOMES = ['PARENT_REJECTED', 'EXPIRED', 'SEAT_UNAVAILABLE_REFUNDED'];

export async function GET(_request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();

    // One literal select string — the client infers the row type from its
    // literal text, so a concatenation loses typing entirely.
    const { data: rowData } = await admin
      .from('bookings')
      .select(
        'id, tutor_id, status, requested_at, requested_start_at, duration_minutes, price_ttd, frozen_price, expires_at, decided_at, decline_reason'
      )
      .eq('student_id', user.id)
      .in('status', ['PENDING_PARENT_APPROVAL', ...RECENT_OUTCOMES])
      .order('requested_at', { ascending: false, nullsFirst: false })
      .limit(50);

    const rows = (rowData ?? []) as unknown as Array<{
      id: string;
      tutor_id: string;
      status: string;
      requested_at: string | null;
      requested_start_at: string;
      duration_minutes: number;
      price_ttd: number | null;
      frozen_price: number | null;
      expires_at: string | null;
      decided_at: string | null;
      decline_reason: string | null;
    }>;

    if (rows.length === 0) {
      return NextResponse.json({ pending: [], outcomes: [], parentName: null });
    }

    const tutorIds = Array.from(new Set(rows.map((r) => r.tutor_id).filter(Boolean)));
    const { data: tutorData } = await admin
      .from('profiles')
      .select('id, full_name, display_name, username')
      .in('id', tutorIds);

    const tutors = (tutorData ?? []) as unknown as Array<{
      id: string;
      full_name: string | null;
      display_name: string | null;
      username: string | null;
    }>;
    const tutorName = new Map(
      tutors.map((t) => [t.id, t.display_name || t.full_name || t.username || 'Tutor'])
    );

    // Naming the parent is what makes the wait legible — "waiting on your
    // parent" is vague, "waiting on Priya" is a person you can go and ask.
    let parentName: string | null = null;
    const { data: link } = await admin
      .from('parent_child_links')
      .select('parent_id')
      .eq('child_id', user.id)
      .limit(1)
      .maybeSingle();

    if (link?.parent_id) {
      const { data: parent } = await admin
        .from('profiles')
        .select('full_name, display_name')
        .eq('id', link.parent_id)
        .maybeSingle();
      const p = parent as { full_name: string | null; display_name: string | null } | null;
      parentName = p?.display_name || p?.full_name || null;
    }

    const now = Date.now();

    return NextResponse.json({
      parentName,
      pending: rows
        .filter((r) => r.status === 'PENDING_PARENT_APPROVAL')
        .map((r) => {
          const price = Number(r.frozen_price ?? r.price_ttd ?? 0);
          return {
            id: r.id,
            tutorName: tutorName.get(r.tutor_id) ?? 'Tutor',
            when: formatWhen(r.requested_start_at),
            minutes: r.duration_minutes,
            priceWhenRequested: price,
            isFree: price <= 0,
            requestedAt: r.requested_at ? formatWhen(r.requested_at) : null,
            closesAt: r.expires_at ? formatWhen(r.expires_at) : null,
            // Shown as closed rather than hidden: a student needs to see that the
            // window ran out, which is the whole point of §4.2 being on-platform.
            closed: r.expires_at ? new Date(r.expires_at).getTime() <= now : false,
          };
        }),
      outcomes: rows
        .filter((r) => r.status !== 'PENDING_PARENT_APPROVAL')
        .map((r) => ({
          id: r.id,
          tutorName: tutorName.get(r.tutor_id) ?? 'Tutor',
          status: r.status,
          at: r.decided_at ? formatWhen(r.decided_at) : null,
          // Sent verbatim by the decline route; rendered as text, never as markup.
          reason: r.decline_reason ?? null,
        })),
    });
  } catch (err) {
    console.error('[GET /api/bookings/my-requests]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
