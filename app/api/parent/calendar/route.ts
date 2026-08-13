// GET /api/parent/calendar — every child's classes in one list.
//
// Handover §9.1: "Family calendar with child filter and ICS subscribe."
//
// PAST AND FUTURE, AND ATTENDANCE ONLY ON THE PAST
// Upcoming events carry no attendance value at all — an occurrence still to
// happen is neither attended nor absent, and colouring it as absent because no
// join exists yet is how a rate looks wrong for the twenty minutes before it
// looks right. So the outcome comes from the shared §6 helper, which only judges
// occurrences whose join window has closed, and everything else is simply
// upcoming.
//
// Cancelled sessions are INCLUDED and marked. A parent who sees a gap in the week
// assumes their child missed something.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { buildAttendanceOutcomes, type OccurrenceInput } from '@/lib/server/attendance';

export const dynamic = 'force-dynamic';

/** A window wide enough to look back at last month and forward at next. */
const DAYS_BACK = 45;
const DAYS_FORWARD = 60;

export async function GET(_request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();

    const { data: links } = await admin
      .from('parent_child_links')
      .select('child_id')
      .eq('parent_id', parentProfile.id);

    const childIds = ((links ?? []) as unknown as Array<{ child_id: string }>).map(
      (l) => l.child_id
    );
    if (childIds.length === 0) {
      return NextResponse.json({ children: [], events: [] });
    }

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, display_name')
      .in('id', childIds);

    const children = ((profiles ?? []) as unknown as Array<{
      id: string;
      full_name: string | null;
      display_name: string | null;
    }>).map((p, i) => ({
      id: p.id,
      name: p.display_name || p.full_name || 'Child',
      // The real defaults from ADD_CHILD_COLOR_CODING_FIXED.sql, so a child's
      // colour is the same here as everywhere else it appears.
      color: ['#9333EA', '#3B82F6', '#10B981', '#F59E0B'][i % 4],
    }));

    const from = new Date(Date.now() - DAYS_BACK * 86_400_000).toISOString();
    const to = new Date(Date.now() + DAYS_FORWARD * 86_400_000).toISOString();
    const nowMs = Date.now();

    type Event = {
      key: string;
      childId: string;
      title: string;
      tutorName: string | null;
      start: string;
      end: string | null;
      type: '1:1' | 'group';
      past: boolean;
      outcome: string | null;
      lateMinutes: number | null;
    };

    const events: Event[] = [];
    const occurrencesByChild = new Map<string, OccurrenceInput[]>();
    const metaByKey = new Map<string, { childId: string; title: string; tutorName: string | null }>();

    // ---- 1:1 sessions -----------------------------------------------------
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, student_id, tutor_id, scheduled_start_at, scheduled_end_at, cancelled_at')
      .in('student_id', childIds)
      .gte('scheduled_start_at', from)
      .lte('scheduled_start_at', to)
      .limit(400);

    const sessionRows = (sessions ?? []) as unknown as Array<{
      id: string;
      student_id: string;
      tutor_id: string;
      scheduled_start_at: string;
      scheduled_end_at: string | null;
      cancelled_at: string | null;
    }>;

    const tutorIds = Array.from(new Set(sessionRows.map((s) => s.tutor_id).filter(Boolean)));

    // ---- group occurrences ------------------------------------------------
    const [{ data: enrolments }, { data: members }] = await Promise.all([
      admin
        .from('group_enrollments')
        .select('student_id, group_id')
        .in('student_id', childIds)
        .in('status', ['ACTIVE', 'GRACE', 'SECURED']),
      admin
        .from('group_members')
        .select('user_id, group_id')
        .in('user_id', childIds)
        .in('status', ['approved', 'active']),
    ]);

    const childGroups = new Map<string, Set<string>>();
    for (const e of (enrolments ?? []) as unknown as Array<{
      student_id: string;
      group_id: string;
    }>) {
      if (!childGroups.has(e.student_id)) childGroups.set(e.student_id, new Set());
      childGroups.get(e.student_id)!.add(e.group_id);
    }
    for (const m of (members ?? []) as unknown as Array<{ user_id: string; group_id: string }>) {
      if (!childGroups.has(m.user_id)) childGroups.set(m.user_id, new Set());
      childGroups.get(m.user_id)!.add(m.group_id);
    }

    const allGroupIds = Array.from(new Set([...childGroups.values()].flatMap((s) => [...s])));

    const groupName = new Map<string, string>();
    const groupTutor = new Map<string, string>();
    const occToGroup = new Map<string, string>();

    if (allGroupIds.length > 0) {
      const { data: groups } = await admin
        .from('groups')
        .select('id, name, subject, tutor_id')
        .in('id', allGroupIds);

      for (const g of (groups ?? []) as unknown as Array<{
        id: string;
        name: string | null;
        subject: string | null;
        tutor_id: string;
      }>) {
        groupName.set(g.id, g.name || g.subject || 'Group class');
        groupTutor.set(g.id, g.tutor_id);
        tutorIds.push(g.tutor_id);
      }

      const { data: gs } = await admin
        .from('group_sessions')
        .select('id, group_id')
        .in('group_id', allGroupIds);

      const gsToGroup = new Map(
        ((gs ?? []) as unknown as Array<{ id: string; group_id: string }>).map((r) => [
          r.id,
          r.group_id,
        ])
      );

      const gsIds = [...gsToGroup.keys()];
      if (gsIds.length > 0) {
        const { data: occ } = await admin
          .from('group_session_occurrences')
          .select('id, group_session_id, scheduled_start_at, scheduled_end_at, cancelled_at')
          .in('group_session_id', gsIds)
          .gte('scheduled_start_at', from)
          .lte('scheduled_start_at', to)
          .limit(600);

        for (const o of (occ ?? []) as unknown as Array<{
          id: string;
          group_session_id: string;
          scheduled_start_at: string;
          scheduled_end_at: string | null;
          cancelled_at: string | null;
        }>) {
          const groupId = gsToGroup.get(o.group_session_id);
          if (!groupId) continue;
          occToGroup.set(o.id, groupId);

          // One occurrence can belong to several children in the same class.
          for (const [childId, groupSet] of childGroups) {
            if (!groupSet.has(groupId)) continue;
            const key = `group_occurrence:${o.id}:${childId}`;
            metaByKey.set(key, {
              childId,
              title: groupName.get(groupId) ?? 'Group class',
              tutorName: null,
            });
            const list = occurrencesByChild.get(childId) ?? [];
            list.push({
              occurrenceType: 'group_occurrence',
              occurrenceId: o.id,
              scheduledStart: o.scheduled_start_at,
              scheduledEnd: o.scheduled_end_at,
              cancelled: Boolean(o.cancelled_at),
            });
            occurrencesByChild.set(childId, list);
            events.push({
              key,
              childId,
              title: groupName.get(groupId) ?? 'Group class',
              tutorName: null,
              start: o.scheduled_start_at,
              end: o.scheduled_end_at,
              type: 'group',
              past: new Date(o.scheduled_start_at).getTime() < nowMs,
              outcome: null,
              lateMinutes: null,
            });
          }
        }
      }
    }

    const { data: tutors } = tutorIds.length
      ? await admin.from('profiles').select('id, full_name, display_name').in('id', tutorIds)
      : { data: [] };

    const tutorName = new Map(
      ((tutors ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
        display_name: string | null;
      }>).map((t) => [t.id, t.display_name || t.full_name || 'Tutor'])
    );

    for (const s of sessionRows) {
      const key = `session:${s.id}:${s.student_id}`;
      const list = occurrencesByChild.get(s.student_id) ?? [];
      list.push({
        occurrenceType: 'session',
        occurrenceId: s.id,
        scheduledStart: s.scheduled_start_at,
        scheduledEnd: s.scheduled_end_at,
        cancelled: Boolean(s.cancelled_at),
      });
      occurrencesByChild.set(s.student_id, list);
      events.push({
        key,
        childId: s.student_id,
        title: `1:1 with ${tutorName.get(s.tutor_id) ?? 'your tutor'}`,
        tutorName: tutorName.get(s.tutor_id) ?? null,
        start: s.scheduled_start_at,
        end: s.scheduled_end_at,
        type: '1:1',
        past: new Date(s.scheduled_start_at).getTime() < nowMs,
        outcome: null,
        lateMinutes: null,
      });
    }

    // Fill group titles that needed the tutor lookup.
    for (const e of events) {
      if (e.type === 'group' && !e.tutorName) {
        const occId = e.key.split(':')[1];
        const groupId = occToGroup.get(occId);
        const tid = groupId ? groupTutor.get(groupId) : null;
        e.tutorName = tid ? (tutorName.get(tid) ?? null) : null;
      }
    }

    // ---- outcomes, from the one §6 helper ---------------------------------
    for (const [childId, occurrences] of occurrencesByChild) {
      const outcomes = await buildAttendanceOutcomes(admin, { studentId: childId, occurrences });
      const byId = new Map(
        outcomes.map((o) => [`${o.occurrenceType}:${o.occurrenceId}:${childId}`, o])
      );
      for (const e of events) {
        if (e.childId !== childId) continue;
        const o = byId.get(e.key);
        if (o) {
          e.outcome = o.outcome;
          e.lateMinutes = o.lateMinutes;
        }
      }
    }

    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return NextResponse.json({ children, events });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/calendar]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
