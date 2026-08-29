// "View class as student" — parent-scoped, READ-ONLY class view for a linked
// child. Does NOT impersonate the student's session: auth.uid() is the parent,
// and the query is parameterized by child_id, authorized via parent_child_links
// (requireParentChild). Returns what a student sees for this class: info +
// material (content_blocks) + upcoming sessions + the child's in-class attendance.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';
import { buildAttendanceOutcomes, formatAttendanceRate, tallyOutcomes } from '@/lib/server/attendance';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ childId: string; groupId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { childId, groupId } = await params;
    await requireParentChild(parentProfile.id, childId); // 404 if not linked
    const nowISO = new Date().toISOString();

    const { data: group, error: groupErr } = await admin
      .from('groups')
      .select('id, name, subject, description, tutor_id, meeting_link')
      .eq('id', groupId)
      .maybeSingle();
    if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 500 });
    if (!group) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    // The child's membership in this class (either system).
    const [{ data: mem }, { data: enr }, { data: tutor }] = await Promise.all([
      admin.from('group_members').select('status').eq('group_id', groupId).eq('user_id', childId).maybeSingle(),
      admin.from('group_enrollments').select('status').eq('group_id', groupId).eq('student_id', childId).maybeSingle(),
      admin.from('profiles').select('full_name, display_name').eq('id', group.tutor_id).maybeSingle(),
    ]);
    const membershipStatus = (mem as any)?.status ?? (enr as any)?.status ?? null;

    // Occurrences for this class, split into upcoming vs past.
    const { data: gsRows } = await admin.from('group_sessions').select('id').eq('group_id', groupId);
    const gsIds = (gsRows ?? []).map((g: any) => g.id);
    let upcoming: { id: string; start: string; end: string }[] = [];
    let attendance: {
      key: string;
      start: string;
      present: boolean;
      status: string | null;
      lateMinutes: number | null;
    }[] = [];
    let attendanceSummary: Record<string, unknown> | null = null;

    if (gsIds.length) {
      // cancelled_at is now selected and cancelled occurrences are NOT filtered
      // out: §6 wants them shown and excluded from the rate. Hiding them left a
      // gap in the list, and a parent who sees a gap assumes their child missed
      // something.
      const { data: occ } = await admin
        .from('group_session_occurrences')
        .select('id, scheduled_start_at, scheduled_end_at, cancelled_at')
        .in('group_session_id', gsIds)
        .order('scheduled_start_at', { ascending: true })
        .limit(200);
      // Upcoming excludes cancelled: a class that is not going to run is not
      // something to put in front of a parent as "next up".
      upcoming = (occ ?? [])
        .filter((o: any) => o.scheduled_start_at >= nowISO && !o.cancelled_at)
        .slice(0, 10)
        .map((o: any) => ({ id: o.id, start: o.scheduled_start_at, end: o.scheduled_end_at }));

      // Was: read session_attendance_log directly and treat "row exists" as
      // present. That skipped the §6 tutor-absent guard, so an occurrence the
      // tutor never opened showed as an absence here while the child's overall
      // rate — computed by the shared helper — had already excluded it. The two
      // parent surfaces contradicted each other about the same session.
      const past = (occ ?? [])
        .filter((o: any) => o.scheduled_start_at < nowISO)
        .sort((a: any, b: any) => (a.scheduled_start_at < b.scheduled_start_at ? 1 : -1))
        .slice(0, 20);

      const outcomes = await buildAttendanceOutcomes(admin, {
        studentId: childId,
        occurrences: past.map((o: any) => ({
          occurrenceType: 'group_occurrence' as const,
          occurrenceId: o.id,
          scheduledStart: o.scheduled_start_at,
          scheduledEnd: o.scheduled_end_at ?? null,
          cancelled: Boolean(o.cancelled_at),
        })),
      });

      const byId = new Map(outcomes.map((o) => [o.occurrenceId, o]));

      attendance = past.map((o: any) => {
        const outcome = byId.get(o.id);
        return {
          key: o.id,
          start: o.scheduled_start_at,
          status: outcome?.outcome ?? null,
          lateMinutes: outcome?.lateMinutes ?? null,
          // Kept for anything still reading it. Late still counts as turning up.
          present: outcome?.outcome === 'attended' || outcome?.outcome === 'late',
        };
      });

      const tally = tallyOutcomes(outcomes);
      attendanceSummary = {
        ...tally,
        excluded: outcomes.filter((o) => o.outcome === 'excluded').length,
        // The one figure, never recomputed downstream.
        rateLabel: formatAttendanceRate(tally),
      };
    }

    // Stream posts (announcements) — mirrors the student stream, read-only.
    let stream: any[] = [];
    {
      let res: { data: any[] | null; error: unknown } = await admin.from('stream_posts')
        .select('id, author_id, author_role, post_type, message_body, pinned_at, created_at')
        .eq('group_id', groupId)
        .order('pinned_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);
      if (res.error) {
        res = await admin.from('stream_posts')
          .select('id, author_id, author_role, post_type, message_body, created_at')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(50);
      }
      const posts = (res.data ?? []) as any[];
      const authorIds = [...new Set(posts.map((p) => p.author_id).filter(Boolean))];
      const { data: authors } = authorIds.length
        ? await admin.from('profiles').select('id, full_name, display_name, avatar_url').in('id', authorIds)
        : { data: [] as any[] };
      const nameOf = new Map((authors ?? []).map((a: any) => [a.id, a.display_name || a.full_name || 'iTutor']));
      const avaOf = new Map((authors ?? []).map((a: any) => [a.id, a.avatar_url ?? null]));
      stream = posts.map((p) => ({
        id: p.id,
        authorName: p.author_id ? (nameOf.get(p.author_id) ?? 'iTutor') : 'iTutor',
        authorAvatar: p.author_id ? (avaOf.get(p.author_id) ?? null) : null,
        authorRole: p.author_role ?? null,
        postType: p.post_type ?? 'message',
        body: p.message_body ?? '',
        pinned: !!p.pinned_at,
        createdAt: p.created_at,
      }));
    }

    // Members (persons in the class).
    let members: any[] = [];
    {
      const { data: mems } = await admin
        .from('group_members').select('user_id, status').eq('group_id', groupId).in('status', ['approved', 'active']).limit(200);
      const uids = [...new Set((mems ?? []).map((m: any) => m.user_id).filter(Boolean))];
      const { data: profs } = uids.length
        ? await admin.from('profiles').select('id, full_name, display_name, avatar_url').in('id', uids)
        : { data: [] as any[] };
      const byId = new Map((profs ?? []).map((x: any) => [x.id, x]));
      members = (mems ?? []).map((m: any) => {
        const pr = byId.get(m.user_id);
        return { id: m.user_id, name: pr?.display_name || pr?.full_name || 'Student', avatarUrl: pr?.avatar_url ?? null, isChild: m.user_id === childId };
      });
    }

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        subject: group.subject ?? null,
        description: group.description ?? null,
        contentBlocks: null, // groups has no content_blocks column; page falls back to description

        tutorName: (tutor as any)?.display_name || (tutor as any)?.full_name || 'Tutor',
      },
      membershipStatus,
      upcoming,
      attendance,
      attendanceSummary,
      stream,
      members,
    });
  } catch (error) {
    if (error instanceof ParentAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
