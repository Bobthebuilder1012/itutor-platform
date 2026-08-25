// GET /api/tutor/clients — everyone a tutor teaches, with the three things the
// Clients page acts on: who their parent is, what their attendance is, and
// where feedback stands this month.
//
// It replaces /api/tutor/feedback/roster, which fed two pages that have merged.
// Three things are new, and each is a deliberate change of position:
//
// 1. THE PARENT IS NOW ADDRESSABLE. The old roster returned a parent NAME and
//    nothing else, on the reasoning that anything more was contact data. The
//    Clients page puts a message button on the parent row, so it also returns
//    the parent's id and avatar. That is not contact data — it is an in-app
//    conversation between two people who already share a student, and decision
//    19 already routes messaging to the parent when one is linked. No email and
//    no phone number cross this boundary, and that part has not changed.
//
// 2. FEEDBACK THIS MONTH. One per student per calendar month is the rule the
//    surface states, so the state has to be readable: the most recent feedback
//    row for this pair inside the current month, or null.
//
// 3. WHICH CLASS, AND WHEN THEY JOINED. The page can be scoped to one class,
//    and a roster reads wrong without a joined date.
//
// Attendance still comes from buildAttendanceSnapshot — §6's single definition,
// the same one the feedback composer freezes into the report.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { buildAttendanceSnapshot } from '@/lib/server/feedbackReports';

export const dynamic = 'force-dynamic';

/** Attendance is a per-student aggregate, so the roll is capped. */
const MAX_STUDENTS = 60;

/** First instant of the current calendar month, Trinidad time. */
function monthStartIso(): string {
  const now = new Date();
  // AST is UTC-4 with no DST, so the month boundary is 04:00Z on the 1st.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 4, 0, 0)).toISOString();
}

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-TT', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Port_of_Spain',
  });

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
    const { data: groupRows } = await admin
      .from('groups')
      .select('id, name')
      .eq('tutor_id', tutorId)
      .is('archived_at', null)
      .limit(200);

    const groups = (groupRows ?? []) as unknown as Array<{ id: string; name: string | null }>;
    const groupIds = groups.map((g) => g.id);
    const groupName = new Map(groups.map((g) => [g.id, g.name ?? 'Group class']));

    const { data: sessionRows } = await admin
      .from('sessions')
      .select('student_id')
      .eq('tutor_id', tutorId)
      .limit(1000);

    // classId -> the classes a student is in; '1:1' is a pseudo-class so the
    // filter can offer it alongside the real ones.
    const classesOf = new Map<string, Array<{ id: string; name: string }>>();
    const joinedAt = new Map<string, string>();

    const addClass = (studentId: string, id: string, name: string, joined: string | null) => {
      const list = classesOf.get(studentId) ?? [];
      if (!list.some((c) => c.id === id)) list.push({ id, name });
      classesOf.set(studentId, list);
      if (joined) {
        const current = joinedAt.get(studentId);
        if (!current || new Date(joined).getTime() < new Date(current).getTime()) {
          joinedAt.set(studentId, joined);
        }
      }
    };

    for (const r of (sessionRows ?? []) as unknown as Array<{ student_id: string }>) {
      if (r.student_id) addClass(r.student_id, '1:1', '1:1 sessions', null);
    }

    if (groupIds.length > 0) {
      const [{ data: enrolments }, { data: members }] = await Promise.all([
        admin
          .from('group_enrollments')
          // enrolled_at, not created_at: both exist (migration 160) and the
          // roster line says "Joined", which is the enrolment, not the row.
          .select('student_id, group_id, enrolled_at')
          .in('group_id', groupIds)
          .in('status', ['ACTIVE', 'GRACE', 'SECURED'])
          .limit(1000),
        admin
          .from('group_members')
          .select('user_id, group_id, joined_at')
          .in('group_id', groupIds)
          .in('status', ['approved', 'active'])
          .limit(1000),
      ]);

      for (const e of (enrolments ?? []) as unknown as Array<{
        student_id: string;
        group_id: string;
        enrolled_at: string | null;
      }>) {
        addClass(e.student_id, e.group_id, groupName.get(e.group_id) ?? 'Group class', e.enrolled_at);
      }
      for (const m of (members ?? []) as unknown as Array<{
        user_id: string;
        group_id: string;
        joined_at: string | null;
      }>) {
        addClass(m.user_id, m.group_id, groupName.get(m.group_id) ?? 'Group class', m.joined_at);
      }
    }

    const studentIds = Array.from(classesOf.keys()).slice(0, MAX_STUDENTS);
    if (studentIds.length === 0) {
      return NextResponse.json({ students: [], classes: [], openRequests: 0, givenThisMonth: 0 });
    }

    // ---- names, parents, requests, feedback this month -------------------
    const [{ data: profileRows }, { data: linkRows }, { data: requestRows }, { data: feedbackRows }] =
      await Promise.all([
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
        // This month only, this tutor only. A colleague's feedback on the same
        // student is not this tutor's quota.
        admin
          .from('feedback')
          .select('id, child_id, created_at')
          .eq('tutor_id', tutorId)
          .in('child_id', studentIds)
          .gte('created_at', monthStartIso())
          .order('created_at', { ascending: false })
          .limit(500),
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

    const parentIds = Array.from(new Set(links.map((l) => l.parent_id)));
    const parentById = new Map<string, { id: string; name: string; avatar: string | null }>();
    if (parentIds.length > 0) {
      const { data: parents } = await admin
        .from('profiles')
        .select('id, full_name, display_name, avatar_url')
        .in('id', parentIds);
      for (const p of (parents ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
        display_name: string | null;
        avatar_url: string | null;
      }>) {
        parentById.set(p.id, {
          id: p.id,
          name: p.display_name || p.full_name || 'Parent',
          avatar: p.avatar_url ?? null,
        });
      }
    }
    const parentOfChild = new Map(
      links.map((l) => [l.child_id, parentById.get(l.parent_id) ?? null])
    );
    const requestByChild = new Map(requests.map((r) => [r.child_id, r]));

    // Newest first from the query, so the first hit per child is the latest.
    const feedbackByChild = new Map<string, { id: string; created_at: string }>();
    for (const f of (feedbackRows ?? []) as unknown as Array<{
      id: string;
      child_id: string;
      created_at: string;
    }>) {
      if (!feedbackByChild.has(f.child_id)) feedbackByChild.set(f.child_id, f);
    }

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
        const given = feedbackByChild.get(id);
        const joined = joinedAt.get(id) ?? null;

        return {
          id,
          name: p?.display_name || p?.full_name || p?.username || 'Student',
          avatar: p?.avatar_url ?? null,
          formLevel: p?.form_level ?? null,
          classes: classesOf.get(id) ?? [],
          joinedAt: joined ? dayMonth(joined) : null,
          parent: parentOfChild.get(id) ?? null,
          attendance: snap
            ? {
                // §6: never a bare percentage — the denominator travels with it.
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
                requestedAt: dayMonth(req.requested_at),
                by: req.requester_role,
              }
            : null,
          feedbackThisMonth: given ? { id: given.id, at: dayMonth(given.created_at) } : null,
        };
      })
      // Open requests first — the only rows anyone is waiting on. §8.1 gives a
      // tutor one notification per request and no reminders, so a request this
      // list buries is a request that is gone.
      .sort((a, b) => {
        if (Boolean(a.openRequest) !== Boolean(b.openRequest)) return a.openRequest ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    // Only classes that actually have someone in them are worth filtering by.
    const usedClassIds = new Set(students.flatMap((s) => s.classes.map((c) => c.id)));
    const classes = [
      ...groups
        .filter((g) => usedClassIds.has(g.id))
        .map((g) => ({ id: g.id, name: g.name ?? 'Group class' })),
      ...(usedClassIds.has('1:1') ? [{ id: '1:1', name: '1:1 sessions' }] : []),
    ];

    return NextResponse.json({
      students,
      classes,
      openRequests: students.filter((s) => s.openRequest).length,
      givenThisMonth: students.filter((s) => s.feedbackThisMonth).length,
    });
  } catch (err) {
    console.error('[GET /api/tutor/clients]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
