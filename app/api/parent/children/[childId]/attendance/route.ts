// A parent's view of a linked child's attendance: every PAST 1:1 session and
// enrolled group occurrence, marked Present (a session_attendance_log row exists)
// or Absent (no row). Service client + link verification — the child's schedule
// and attendance rows are RLS-scoped to the child.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ childId: string }> };
type Row = { key: string; type: '1:1' | 'group'; label: string; start: string; present: boolean };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { childId } = await params;
    await requireParentChild(parentProfile.id, childId); // 404 if not linked
    const nowISO = new Date().toISOString();

    // Present-log lookup set: `${type}:${occurrence_id}`
    const { data: logs } = await admin
      .from('session_attendance_log')
      .select('occurrence_type, occurrence_id')
      .eq('student_id', childId);
    const present = new Set((logs ?? []).map((l: any) => `${l.occurrence_type}:${l.occurrence_id}`));

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

    const rows: Row[] = (sessions ?? []).map((s: any) => ({
      key: `session:${s.id}`,
      type: '1:1',
      label: `1:1 session with ${s.tutor_id ? (tutorName.get(s.tutor_id) ?? 'Tutor') : 'Tutor'}`,
      start: s.scheduled_start_at,
      present: present.has(`session:${s.id}`),
    }));

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
        const { data: occ } = await admin
          .from('group_session_occurrences')
          .select('id, group_session_id, scheduled_start_at')
          .in('group_session_id', gsIds)
          .is('cancelled_at', null)
          .lt('scheduled_start_at', nowISO)
          .order('scheduled_start_at', { ascending: false })
          .limit(60);
        (occ ?? []).forEach((o: any) => {
          const gId = groupOfSession.get(o.group_session_id);
          rows.push({
            key: `group_occurrence:${o.id}`,
            type: 'group',
            label: gId ? (groupName.get(gId) ?? 'Group class') : 'Group class',
            start: o.scheduled_start_at,
            present: present.has(`group_occurrence:${o.id}`),
          });
        });
      }
    }

    rows.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
    const presentCount = rows.filter((r) => r.present).length;
    return NextResponse.json({
      attendance: rows,
      summary: { present: presentCount, absent: rows.length - presentCount, total: rows.length },
    });
  } catch (error) {
    if (error instanceof ParentAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
