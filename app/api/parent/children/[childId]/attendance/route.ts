// A parent's view of a linked child's attendance: every PAST 1:1 session and
// enrolled group occurrence. Service client + link verification — the child's
// schedule and attendance rows are RLS-scoped to the child.
//
// The statuses and the rate come from lib/server/attendance, not from this
// route. §6 requires one helper shared by the tutor roster, the student class
// view, the parent child view and the family calendar: "Independent
// implementations are how the numbers start disagreeing." This route used to
// compute present/absent itself, which meant it knew nothing about lateness and
// nothing about the tutor-absent guard — so a class the tutor never opened
// showed the child as absent.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';
import {
  attendanceRate,
  buildAttendanceOutcomes,
  formatAttendanceRate,
  tallyOutcomes,
  type OccurrenceInput,
} from '@/lib/server/attendance';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ childId: string }> };
type Meta = { key: string; type: '1:1' | 'group'; label: string; start: string };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { childId } = await params;
    await requireParentChild(parentProfile.id, childId); // 404 if not linked
    const nowISO = new Date().toISOString();

    // Occurrences are collected here; every judgement about them is made by the
    // shared helper further down.
    const meta = new Map<string, Meta>();
    const occurrences: OccurrenceInput[] = [];

    // Past 1:1 sessions
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, tutor_id, scheduled_start_at, scheduled_end_at')
      .eq('student_id', childId)
      .is('cancelled_at', null)
      .lt('scheduled_start_at', nowISO)
      .order('scheduled_start_at', { ascending: false })
      .limit(60);
    const tutorIds = [...new Set((sessions ?? []).map((s: any) => s.tutor_id).filter(Boolean))];
    const { data: tutors } = tutorIds.length
      ? await admin.from('profiles').select('id, full_name, display_name').in('id', tutorIds)
      : { data: [] as any[] };
    const tutorName = new Map((tutors ?? []).map((t: any) => [t.id, t.display_name || t.full_name || 'Tutor']));

    (sessions ?? []).forEach((s: any) => {
      const key = `session:${s.id}`;
      meta.set(key, {
        key,
        type: '1:1',
        label: `1:1 session with ${s.tutor_id ? (tutorName.get(s.tutor_id) ?? 'Tutor') : 'Tutor'}`,
        start: s.scheduled_start_at,
      });
      occurrences.push({
        occurrenceType: 'session',
        occurrenceId: s.id,
        scheduledStart: s.scheduled_start_at,
        scheduledEnd: s.scheduled_end_at ?? null,
      });
    });

    // Past group occurrences for the child's enrolled groups
    const [{ data: mems }, { data: enrolls }] = await Promise.all([
      admin.from('group_members').select('group_id').eq('user_id', childId).in('status', ['approved', 'active']),
      admin.from('group_enrollments').select('group_id').eq('student_id', childId).in('status', ['ACTIVE', 'GRACE']),
    ]);
    const groupIds = [...new Set([...(mems ?? []), ...(enrolls ?? [])].map((r: any) => r.group_id).filter(Boolean))];
    if (groupIds.length) {
      const [{ data: gsRows }, { data: groups }] = await Promise.all([
        admin.from('group_sessions').select('id, group_id').in('group_id', groupIds),
        admin.from('groups').select('id, name').in('id', groupIds),
      ]);
      const groupName = new Map((groups ?? []).map((g: any) => [g.id, g.name]));
      const groupOfSession = new Map((gsRows ?? []).map((g: any) => [g.id, g.group_id]));
      const gsIds = (gsRows ?? []).map((g: any) => g.id);
      if (gsIds.length) {
        // Cancelled occurrences are now fetched rather than filtered out: §6
        // wants them shown and excluded from the rate, not hidden. A parent who
        // sees a gap in the grid assumes their child missed something.
        const { data: occ } = await admin
          .from('group_session_occurrences')
          .select('id, group_session_id, scheduled_start_at, scheduled_end_at, cancelled_at')
          .in('group_session_id', gsIds)
          .lt('scheduled_start_at', nowISO)
          .order('scheduled_start_at', { ascending: false })
          .limit(60);
        (occ ?? []).forEach((o: any) => {
          const gId = groupOfSession.get(o.group_session_id);
          const key = `group_occurrence:${o.id}`;
          meta.set(key, {
            key,
            type: 'group',
            label: gId ? (groupName.get(gId) ?? 'Group class') : 'Group class',
            start: o.scheduled_start_at,
          });
          occurrences.push({
            occurrenceType: 'group_occurrence',
            occurrenceId: o.id,
            scheduledStart: o.scheduled_start_at,
            scheduledEnd: o.scheduled_end_at ?? null,
            cancelled: Boolean(o.cancelled_at),
          });
        });
      }
    }

    // One helper, four callers (§6).
    const outcomes = await buildAttendanceOutcomes(admin, { studentId: childId, occurrences });

    const rows = outcomes
      .map((o) => {
        const key = `${o.occurrenceType}:${o.occurrenceId}`;
        const m = meta.get(key);
        return {
          key,
          type: m?.type ?? 'group',
          label: m?.label ?? 'Class',
          start: m?.start ?? o.scheduledStart,
          status: o.outcome,
          lateMinutes: o.lateMinutes,
          // Kept so anything already reading `present` keeps working. Late still
          // counts as having turned up, which is what present means here.
          present: o.outcome === 'attended' || o.outcome === 'late',
          excludedReason: o.excludedReason ?? null,
        };
      })
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

    const tally = tallyOutcomes(outcomes);
    const { rate, counted } = attendanceRate(tally);

    return NextResponse.json({
      attendance: rows,
      summary: {
        // Existing shape, unchanged for existing callers.
        present: tally.attended + tally.late,
        absent: tally.absent,
        total: counted,
        // §6's fuller picture.
        attended: tally.attended,
        late: tally.late,
        cancelled: tally.cancelled,
        // Sessions the tutor never opened. Excluded from the rate entirely.
        excluded: outcomes.filter((o) => o.outcome === 'excluded').length,
        rate,
        counted,
        // Never print a rate without its denominator (§6).
        rateLabel: formatAttendanceRate(tally),
      },
    });
  } catch (error) {
    if (error instanceof ParentAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
