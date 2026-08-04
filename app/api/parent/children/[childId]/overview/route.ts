// A parent's view of a linked child's classes + 1:1 booking history. MUST run
// server-side with the service client: the child's group_members / bookings are
// RLS-scoped to the child, so a parent querying them from the browser sees
// nothing (that was the "no classes shown" bug). requireParentChild verifies the
// link before returning anything.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ childId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { childId } = await params;
    const child = await requireParentChild(parentProfile.id, childId); // throws 404 if not linked

    // Group-class enrolments
    const { data: mems } = await admin
      .from('group_members')
      .select('group_id, status, joined_at')
      .eq('user_id', childId);
    const groupIds = [...new Set((mems ?? []).map((m) => m.group_id).filter(Boolean))];
    const { data: groups } = groupIds.length
      ? await admin.from('groups').select('id, name, subject').in('id', groupIds)
      : { data: [] as any[] };
    const groupById = new Map((groups ?? []).map((g: any) => [g.id, g]));
    const enrollments = (mems ?? []).map((m: any) => {
      const g = groupById.get(m.group_id);
      return { groupId: m.group_id, name: g?.name ?? 'Class', subject: g?.subject ?? null, status: m.status, joinedAt: m.joined_at };
    });

    // 1:1 booking history
    const { data: bk } = await admin
      .from('bookings')
      .select('id, tutor_id, subject_id, status, requested_start_at, confirmed_start_at, price_ttd, duration_minutes, created_at')
      .eq('student_id', childId)
      .order('created_at', { ascending: false })
      .limit(100);
    const tutorIds = [...new Set((bk ?? []).map((b) => b.tutor_id).filter(Boolean))];
    const subjectIds = [...new Set((bk ?? []).map((b) => b.subject_id).filter(Boolean))];
    const [{ data: tutors }, { data: subjects }] = await Promise.all([
      tutorIds.length ? admin.from('profiles').select('id, full_name, display_name').in('id', tutorIds) : Promise.resolve({ data: [] as any[] }),
      subjectIds.length ? admin.from('subjects').select('id, name, label').in('id', subjectIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const tutorName = new Map((tutors ?? []).map((t: any) => [t.id, t.display_name || t.full_name || 'Tutor']));
    const subjName = new Map((subjects ?? []).map((s: any) => [s.id, s.label || s.name]));
    const bookings = (bk ?? []).map((b: any) => ({
      id: b.id,
      tutorName: b.tutor_id ? (tutorName.get(b.tutor_id) ?? 'Tutor') : 'Tutor',
      subject: b.subject_id ? (subjName.get(b.subject_id) ?? null) : null,
      status: b.status,
      start: b.confirmed_start_at || b.requested_start_at || null,
      priceTtd: b.price_ttd,
      durationMinutes: b.duration_minutes,
      createdAt: b.created_at,
    }));

    return NextResponse.json({
      child: { name: child.display_name || child.full_name || 'Child' },
      enrollments,
      bookings,
    });
  } catch (error) {
    if (error instanceof ParentAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
