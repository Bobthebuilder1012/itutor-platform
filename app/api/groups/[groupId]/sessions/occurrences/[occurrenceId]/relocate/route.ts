// PATCH /api/groups/[groupId]/sessions/occurrences/[occurrenceId]/relocate
//
// §5. One session meets somewhere else this week. The room floods, the school
// hall is double-booked, the tutor borrows a friend's space — this is the
// ordinary case, not an edge case, and migration 242 anticipated it with
// `group_session_occurrences.venue_id` ("Per-session override for a one-off
// relocation. NULL means use the class venue.").
//
// ── RELOCATING IS NOT RESCHEDULING ─────────────────────────────────────────
// The time does not move, so nothing about the schedule, the reminders queue or
// the conflict checks is touched. Only the place changes, and only for this one
// occurrence. Clearing it (`venue_id: null`) puts the session back at the class
// venue, which is why "Back to the usual place" is an action rather than the
// tutor having to re-pick the class's own venue from a list.
//
// ── THE STUDENTS ARE TOLD, AND THAT IS THE POINT ───────────────────────────
// A silent relocation sends people to an empty room. So every enrolled student
// gets a notification naming the new place — using `group_session_updated`,
// which already exists in `notifications_type_check`. A new type would need a
// migration, and an unlisted type does not warn: it throws, and the insert is
// wrapped in a try/catch, so the tutor would be told the move succeeded while
// nobody was informed. That is exactly how tutors once stopped being told about
// join requests at all (see migration 203).
//
// ── THE VENUE MUST BE THE TUTOR'S OWN ──────────────────────────────────────
// Checked server-side against `venues.tutor_id`. Without it, any occurrence
// could be pointed at any venue id in the database, and the class page would
// then publish a stranger's street address to a roster of students.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string; occurrenceId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { groupId, occurrenceId } = await params;

    const supabase = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (!actor.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let body: { venue_id?: string | null };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const venueId = typeof body.venue_id === 'string' && body.venue_id ? body.venue_id : null;

    const service = getServiceClient();

    const { data: group } = await service
      .from('groups')
      .select('id, tutor_id, name, venue_id, class_format')
      .eq('id', groupId)
      .maybeSingle();
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const { data: occurrence } = await service
      .from('group_session_occurrences')
      .select('id, group_session_id, scheduled_start_at')
      .eq('id', occurrenceId)
      .maybeSingle();
    if (!occurrence) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    // The occurrence must belong to THIS class. Occurrence ids are opaque and a
    // tutor could otherwise relocate a session in someone else's class simply by
    // pairing it with a groupId they do own.
    const { data: parentSession } = await service
      .from('group_sessions')
      .select('id, group_id')
      .eq('id', (occurrence as any).group_session_id)
      .maybeSingle();
    if (!parentSession || (parentSession as any).group_id !== groupId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    let venue: { id: string; name: string } | null = null;
    if (venueId) {
      const { data: v } = await service
        .from('venues')
        .select('id, name, tutor_id, archived_at')
        .eq('id', venueId)
        .maybeSingle();
      if (!v || (v as any).tutor_id !== (group as any).tutor_id) {
        return NextResponse.json({ error: 'That venue is not yours.' }, { status: 403 });
      }
      if ((v as any).archived_at) {
        return NextResponse.json({ error: 'That venue is archived.' }, { status: 400 });
      }
      venue = { id: (v as any).id, name: (v as any).name };
    }

    const { error: updateErr } = await service
      .from('group_session_occurrences')
      .update({ venue_id: venueId })
      .eq('id', occurrenceId);

    if (updateErr) {
      // 242 unapplied: the column does not exist, so relocation cannot work.
      console.error('[relocate] update failed:', updateErr.message);
      return NextResponse.json({ error: 'Could not move this session.' }, { status: 500 });
    }

    await auditAdminOverride(actor, 'session.occurrence.relocate', { occurrenceId, venueId });

    // Tell the students. Non-critical to the write, but the write is close to
    // pointless without it — see the header.
    try {
      const { data: enrolments } = await service
        .from('group_enrollments')
        .select('student_id')
        .eq('group_id', groupId)
        .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED', 'PENDING_PAYMENT']);
      const { data: members } = await service
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .in('status', ['active', 'approved']);

      const recipients = Array.from(
        new Set([
          ...((enrolments ?? []) as any[]).map((e) => e.student_id),
          ...((members ?? []) as any[]).map((m) => m.user_id),
        ])
      ).filter(Boolean);

      if (recipients.length > 0) {
        const when = (occurrence as any).scheduled_start_at
          ? new Date((occurrence as any).scheduled_start_at).toLocaleDateString('en-TT', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })
          : 'your next session';

        const message = venue
          ? `Your ${(group as any).name} session on ${when} will meet at ${venue.name} instead. Check the class page for directions.`
          : `Your ${(group as any).name} session on ${when} is back at the usual place.`;

        await service.from('notifications').insert(
          recipients.map((uid) => ({
            user_id: uid,
            type: 'group_session_updated',
            title: venue ? 'This session has moved' : 'This session is back at the usual place',
            message,
            group_id: groupId,
            metadata: { groupId, occurrenceId, venueId },
          }))
        );
      }
    } catch (notifyErr) {
      console.error('[relocate] notifications failed:', notifyErr);
    }

    return NextResponse.json({ ok: true, venue_id: venueId, venue_name: venue?.name ?? null });
  } catch (err) {
    console.error('[PATCH /api/groups/[groupId]/sessions/occurrences/[occurrenceId]/relocate]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
