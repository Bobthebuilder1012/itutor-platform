// "View class as student" — parent-scoped, READ-ONLY class view for a linked
// child. Does NOT impersonate the student's session: auth.uid() is the parent,
// and the query is parameterized by child_id, authorized via parent_child_links
// (requireParentChild). Returns what a student sees for this class: info +
// material (content_blocks) + upcoming sessions + the child's in-class attendance.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';

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
    let attendance: { key: string; start: string; present: boolean }[] = [];
    if (gsIds.length) {
      const { data: occ } = await admin
        .from('group_session_occurrences')
        .select('id, scheduled_start_at, scheduled_end_at')
        .in('group_session_id', gsIds)
        .eq('is_cancelled', false)
        .order('scheduled_start_at', { ascending: true })
        .limit(200);
      upcoming = (occ ?? [])
        .filter((o: any) => o.scheduled_start_at >= nowISO)
        .slice(0, 10)
        .map((o: any) => ({ id: o.id, start: o.scheduled_start_at, end: o.scheduled_end_at }));

      const { data: logs } = await admin
        .from('session_attendance_log')
        .select('occurrence_id')
        .eq('student_id', childId)
        .eq('occurrence_type', 'group_occurrence');
      const present = new Set((logs ?? []).map((l: any) => l.occurrence_id));
      attendance = (occ ?? [])
        .filter((o: any) => o.scheduled_start_at < nowISO)
        .sort((a: any, b: any) => (a.scheduled_start_at < b.scheduled_start_at ? 1 : -1))
        .slice(0, 20)
        .map((o: any) => ({ key: o.id, start: o.scheduled_start_at, present: present.has(o.id) }));
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
    });
  } catch (error) {
    if (error instanceof ParentAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
