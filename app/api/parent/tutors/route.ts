// GET /api/parent/tutors — the tutors who teach this parent's children.
//
// Backs two surfaces: the parent's message threads (decision 19 — tutor
// messaging targets the parent when a child is linked, so the parent needs an
// inbox and a way to start one) and the parent-facing tutor profile.
//
// SCOPED TO TUTORS WHO ACTUALLY TEACH THEIR CHILDREN. A parent cannot open a
// thread with an arbitrary tutor: the relationship is what grants the contact,
// exactly as it does on the student side. Without that this becomes a directory
// of adults any account can message.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();

    const { data: links } = await admin
      .from('parent_child_links')
      .select('child_id')
      .eq('parent_id', parentProfile.id);

    const childIds = ((links ?? []) as unknown as Array<{ child_id: string }>).map((l) => l.child_id);
    if (childIds.length === 0) return NextResponse.json({ tutors: [] });

    const { data: childProfiles } = await admin
      .from('profiles')
      .select('id, full_name, display_name')
      .in('id', childIds);

    const childName = new Map(
      ((childProfiles ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
        display_name: string | null;
      }>).map((p) => [p.id, p.display_name || p.full_name || 'your child'])
    );

    // 1:1 tutors.
    const { data: sessions } = await admin
      .from('sessions')
      .select('tutor_id, student_id')
      .in('student_id', childIds)
      .limit(500);

    // tutorId -> which children they teach
    const teaches = new Map<string, Set<string>>();
    const add = (tutorId: string, childId: string) => {
      if (!tutorId) return;
      if (!teaches.has(tutorId)) teaches.set(tutorId, new Set());
      teaches.get(tutorId)!.add(childId);
    };

    for (const s of (sessions ?? []) as unknown as Array<{ tutor_id: string; student_id: string }>) {
      add(s.tutor_id, s.student_id);
    }

    // Group-class tutors: a parent can be connected to a tutor entirely through
    // a class, with no 1:1 history.
    const [{ data: enrolments }, { data: members }] = await Promise.all([
      admin
        .from('group_enrollments')
        .select('group_id, student_id')
        .in('student_id', childIds)
        .in('status', ['ACTIVE', 'GRACE', 'SECURED']),
      admin
        .from('group_members')
        .select('group_id, user_id')
        .in('user_id', childIds)
        .in('status', ['approved', 'active']),
    ]);

    const groupToChildren = new Map<string, Set<string>>();
    for (const e of (enrolments ?? []) as unknown as Array<{ group_id: string; student_id: string }>) {
      if (!groupToChildren.has(e.group_id)) groupToChildren.set(e.group_id, new Set());
      groupToChildren.get(e.group_id)!.add(e.student_id);
    }
    for (const m of (members ?? []) as unknown as Array<{ group_id: string; user_id: string }>) {
      if (!groupToChildren.has(m.group_id)) groupToChildren.set(m.group_id, new Set());
      groupToChildren.get(m.group_id)!.add(m.user_id);
    }

    const groupIds = [...groupToChildren.keys()];
    const viaClass = new Map<string, string>();

    if (groupIds.length > 0) {
      const { data: groups } = await admin
        .from('groups')
        .select('id, name, subject, tutor_id')
        .in('id', groupIds);

      for (const g of (groups ?? []) as unknown as Array<{
        id: string;
        name: string | null;
        subject: string | null;
        tutor_id: string;
      }>) {
        for (const childId of groupToChildren.get(g.id) ?? []) add(g.tutor_id, childId);
        if (g.tutor_id) viaClass.set(g.tutor_id, g.name || g.subject || 'a group class');
      }
    }

    const tutorIds = [...teaches.keys()];
    if (tutorIds.length === 0) return NextResponse.json({ tutors: [] });

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, display_name, username, avatar_url, tutor_verification_status, rating_average, bio')
      .in('id', tutorIds);

    const tutors = ((profiles ?? []) as unknown as Array<{
      id: string;
      full_name: string | null;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
      tutor_verification_status: string | null;
      rating_average: number | null;
      bio: string | null;
    }>).map((t) => ({
      id: t.id,
      name: t.display_name || t.full_name || t.username || 'Tutor',
      avatar: t.avatar_url ?? null,
      // Decision 31: verification is the only trust attribute the product holds.
      verified: t.tutor_verification_status === 'VERIFIED',
      rating: t.rating_average ?? null,
      bio: t.bio ?? null,
      teaches: [...(teaches.get(t.id) ?? [])].map((cid) => childName.get(cid) ?? 'your child'),
      via: viaClass.get(t.id) ?? '1:1 sessions',
    }));

    return NextResponse.json({ tutors });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/tutors]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
