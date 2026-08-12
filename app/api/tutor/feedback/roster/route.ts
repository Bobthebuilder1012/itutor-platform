// GET /api/tutor/feedback/roster — the tutor's students, for the feedback surface.
//
// Handover §9.3: "rows with attached parent (name only), attendance with
// denominator, open-request chip, Send feedback and Message actions" and
// "My Students — aggregate across group and 1:1, since 1:1 students belong to
// no class".
//
// THE PARENT BLOCK IS NAME ONLY
// §9.3 and the design spec: name, and nothing else. No email, no phone, no
// profile link. A tutor needs to know who will receive what they write and who
// to address; anything more is contact data the platform has no reason to hand
// over, and messaging already routes to the parent when one is linked
// (decision 19).
//
// Open requests sort first, because they are the only thing in this list that
// someone is actually waiting on. §8.1 gives a tutor exactly one notification
// per request and no reminders — so if this list buries it, it is gone.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { buildAttendanceSnapshot } from '@/lib/server/feedbackReports';

export const dynamic = 'force-dynamic';

/** Attendance is a per-student aggregate, so the roster is capped. */
const MAX_STUDENTS = 60;

export async function GET(_request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();
    const tutorId = user.id;

    // ---- who does this tutor teach --------------------------------------
    // Two sources, because a 1:1 student belongs to no class and a group
    // student may have no session row.
    const { data: sessionRows } = await admin
      .from('sessions')
      .select('student_id')
      .eq('tutor_id', tutorId)
      .limit(1000);

    const viaSessions = new Set(
      ((sessionRows ?? []) as unknown as Array<{ student_id: string }>).map((r) => r.student_id)
    );

    const { data: groupRows } = await admin
      .from('groups')
      .select('id, name')
      .eq('tutor_id', tutorId)
      .limit(200);

    const groups = (groupRows ?? []) as unknown as Array<{ id: string; name: string | null }>;
    const groupIds = groups.map((g) => g.id);
    const groupName = new Map(groups.map((g) => [g.id, g.name ?? 'Group class']));

    // Which class each student came through, for the "via" line.
    const via = new Map<string, string>();
    for (const id of viaSessions) via.set(id, '1:1 sessions');

    if (groupIds.length > 0) {
      const [{ data: enrolments }, { data: members }] = await Promise.all([
        admin
          .from('group_enrollments')
          .select('student_id, group_id')
          .in('group_id', groupIds)
          .in('status', ['ACTIVE', 'GRACE', 'SECURED'])
          .limit(1000),
        admin
          .from('group_members')
          .select('user_id, group_id')
          .in('group_id', groupIds)
          .in('status', ['approved', 'active'])
          .limit(1000),
      ]);

      for (const e of (enrolments ?? []) as unknown as Array<{
        student_id: string;
        group_id: string;
      }>) {
        if (!via.has(e.student_id)) via.set(e.student_id, groupName.get(e.group_id) ?? 'Group class');
      }
      for (const m of (members ?? []) as unknown as Array<{ user_id: string; group_id: string }>) {
        if (!via.has(m.user_id)) via.set(m.user_id, groupName.get(m.group_id) ?? 'Group class');
      }
    }

    const studentIds = Array.from(via.keys()).slice(0, MAX_STUDENTS);
    if (studentIds.length === 0) {
      return NextResponse.json({ students: [], openRequests: 0 });
    }

    // ---- names, parents, open requests ----------------------------------
    const [{ data: profileRows }, { data: linkRows }, { data: requestRows }] = await Promise.all([
      admin
        .from('profiles')
        .select('id, full_name, display_name, username, avatar_url, form_level')
        .in('id', studentIds),
      admin.from('parent_child_links').select('child_id, parent_id').in('child_id', studentIds),
      admin
        .from('feedback_requests')
        .select('id, child_id, requested_at, requester_role, status')
        .eq('tutor_id', tutorId)
        .eq('status', 'open')
        .in('child_id', studentIds),
    ]);

    const profiles = (profileRows ?? []) as unknown as Array<{
      id: string;
      full_name: string | null;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
      form_level: string | null;
    }>;
    const links = (linkRows ?? []) as unknown as Array<{ child_id: string; parent_id: string }>;
    const requests = (requestRows ?? []) as unknown as Array<{
      id: string;
      child_id: string;
      requested_at: string;
      requester_role: string;
    }>;

    // Parent NAMES only — never their email, phone or id-derived contact route.
    const parentIds = Array.from(new Set(links.map((l) => l.parent_id)));
    const parentNameById = new Map<string, string>();
    if (parentIds.length > 0) {
      const { data: parents } = await admin
        .from('profiles')
        .select('id, full_name, display_name')
        .in('id', parentIds);
      for (const p of (parents ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
        display_name: string | null;
      }>) {
        parentNameById.set(p.id, p.display_name || p.full_name || 'Parent');
      }
    }
    const parentOfChild = new Map(links.map((l) => [l.child_id, parentNameById.get(l.parent_id) ?? 'Parent']));
    const requestByChild = new Map(requests.map((r) => [r.child_id, r]));

    // ---- attendance, from the one shared helper (§6) ---------------------
    const snapshots = await Promise.all(
      studentIds.map((id) => buildAttendanceSnapshot(admin, { childId: id, tutorId }))
    );
    const snapshotById = new Map(studentIds.map((id, i) => [id, snapshots[i]]));

    const students = studentIds
      .map((id) => {
        const p = profiles.find((x) => x.id === id);
        const req = requestByChild.get(id);
        const snap = snapshotById.get(id);
        return {
          id,
          name: p?.display_name || p?.full_name || p?.username || 'Student',
          avatar: p?.avatar_url ?? null,
          formLevel: p?.form_level ?? null,
          via: via.get(id) ?? null,
          // Name only. Decision 19: messaging targets the parent when linked.
          parentName: parentOfChild.get(id) ?? null,
          attendance: snap
            ? {
                // §6: never a bare percentage.
                label: snap.rateLabel,
                rate: snap.rate,
                counted: snap.counted,
                attended: snap.attended,
                late: snap.late,
                absent: snap.absent,
                cancelled: snap.cancelled,
                excluded: snap.excluded,
              }
            : null,
          openRequest: req
            ? {
                id: req.id,
                requestedAt: new Date(req.requested_at).toLocaleDateString('en-TT', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'America/Port_of_Spain',
                }),
                by: req.requester_role,
              }
            : null,
        };
      })
      // Open requests first — the only rows anyone is waiting on.
      .sort((a, b) => {
        if (Boolean(a.openRequest) !== Boolean(b.openRequest)) return a.openRequest ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json({ students, openRequests: requests.length });
  } catch (err) {
    console.error('[GET /api/tutor/feedback/roster]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
