// GET /api/student/attendance — a student's own record.
//
// §9.2: "Own attendance, read-only, in the class view." Decision 17: students and
// tutors both read attendance, neither writes it. Until now a student could not
// see their own record anywhere — it was visible to their parent and their tutor
// and not to them, which is the wrong way round for the person it describes.
//
// Same shared helper as every other surface (§6), so a student and their parent
// cannot be shown different numbers for the same sessions. That is not a nicety:
// a household comparing two screens and finding two figures has no way to tell
// which is wrong.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  attendanceRate,
  buildAttendanceOutcomes,
  formatAttendanceRate,
  tallyOutcomes,
  type OccurrenceInput,
} from '@/lib/server/attendance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Optional: scope to one class, for the class view.
    const groupId = request.nextUrl.searchParams.get('groupId');

    const admin = getServiceClient();
    const nowIso = new Date().toISOString();

    const occurrences: OccurrenceInput[] = [];
    const meta = new Map<string, { label: string; start: string; type: '1:1' | 'group' }>();

    // 1:1 sessions — skipped when scoped to a class.
    if (!groupId) {
      const { data: sessions } = await admin
        .from('sessions')
        .select('id, tutor_id, scheduled_start_at, scheduled_end_at, cancelled_at')
        .eq('student_id', user.id)
        .lt('scheduled_start_at', nowIso)
        .order('scheduled_start_at', { ascending: false })
        .limit(60);

      const rows = (sessions ?? []) as unknown as Array<{
        id: string;
        tutor_id: string;
        scheduled_start_at: string;
        scheduled_end_at: string | null;
        cancelled_at: string | null;
      }>;

      const tutorIds = Array.from(new Set(rows.map((s) => s.tutor_id).filter(Boolean)));
      const { data: tutors } = tutorIds.length
        ? await admin.from('profiles').select('id, full_name, display_name').in('id', tutorIds)
        : { data: [] };

      const tutorName = new Map(
        ((tutors ?? []) as unknown as Array<{
          id: string;
          full_name: string | null;
          display_name: string | null;
        }>).map((t) => [t.id, t.display_name || t.full_name || 'your tutor'])
      );

      for (const s of rows) {
        meta.set(`session:${s.id}`, {
          label: `1:1 with ${tutorName.get(s.tutor_id) ?? 'your tutor'}`,
          start: s.scheduled_start_at,
          type: '1:1',
        });
        occurrences.push({
          occurrenceType: 'session',
          occurrenceId: s.id,
          scheduledStart: s.scheduled_start_at,
          scheduledEnd: s.scheduled_end_at,
          cancelled: Boolean(s.cancelled_at),
        });
      }
    }

    // Group occurrences for the classes this student is on.
    const [{ data: enrolments }, { data: members }] = await Promise.all([
      admin
        .from('group_enrollments')
        .select('group_id')
        .eq('student_id', user.id)
        .in('status', ['ACTIVE', 'GRACE', 'SECURED']),
      admin
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id)
        .in('status', ['approved', 'active']),
    ]);

    let groupIds = Array.from(
      new Set(
        [
          ...((enrolments ?? []) as unknown as Array<{ group_id: string }>),
          ...((members ?? []) as unknown as Array<{ group_id: string }>),
        ].map((r) => r.group_id)
      )
    );

    // A groupId the student is not on returns nothing rather than everything.
    if (groupId) groupIds = groupIds.filter((g) => g === groupId);

    if (groupIds.length > 0) {
      const { data: groups } = await admin
        .from('groups')
        .select('id, name, subject')
        .in('id', groupIds);

      const groupName = new Map(
        ((groups ?? []) as unknown as Array<{
          id: string;
          name: string | null;
          subject: string | null;
        }>).map((g) => [g.id, g.name || g.subject || 'Group class'])
      );

      const { data: gs } = await admin
        .from('group_sessions')
        .select('id, group_id')
        .in('group_id', groupIds);

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
          .lt('scheduled_start_at', nowIso)
          .order('scheduled_start_at', { ascending: false })
          .limit(120);

        for (const o of (occ ?? []) as unknown as Array<{
          id: string;
          group_session_id: string;
          scheduled_start_at: string;
          scheduled_end_at: string | null;
          cancelled_at: string | null;
        }>) {
          const gid = gsToGroup.get(o.group_session_id);
          if (!gid) continue;
          meta.set(`group_occurrence:${o.id}`, {
            label: groupName.get(gid) ?? 'Group class',
            start: o.scheduled_start_at,
            type: 'group',
          });
          occurrences.push({
            occurrenceType: 'group_occurrence',
            occurrenceId: o.id,
            scheduledStart: o.scheduled_start_at,
            scheduledEnd: o.scheduled_end_at,
            cancelled: Boolean(o.cancelled_at),
          });
        }
      }
    }

    const outcomes = await buildAttendanceOutcomes(admin, {
      studentId: user.id,
      occurrences,
    });

    const tally = tallyOutcomes(outcomes);
    const { rate, counted } = attendanceRate(tally);

    const rows = outcomes
      .map((o) => {
        const key = `${o.occurrenceType}:${o.occurrenceId}`;
        const m = meta.get(key);
        return {
          key,
          label: m?.label ?? 'Class',
          start: m?.start ?? o.scheduledStart,
          type: m?.type ?? 'group',
          status: o.outcome,
          lateMinutes: o.lateMinutes,
        };
      })
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

    return NextResponse.json({
      attendance: rows,
      summary: {
        ...tally,
        excluded: outcomes.filter((o) => o.outcome === 'excluded').length,
        rate,
        counted,
        rateLabel: formatAttendanceRate(tally),
      },
    });
  } catch (err) {
    console.error('[GET /api/student/attendance]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
