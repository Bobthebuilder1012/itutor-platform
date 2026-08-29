// GET /api/student/my-tutors — one card per tutor the student learns from.
//
// Handover §9.2: "Tutor cards in My Classes — Request feedback and Message
// tutor. Request disabled with a plain reason when the shared quota is used,
// naming who used it."
//
// The quota state is resolved here, per tutor, rather than left to the client to
// fetch one call at a time. It is also the same getQuotaStatus the parent
// surfaces use, so the sentence a student reads about who spent the request is
// character-identical to the one their parent reads (decision 13).

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getQuotaStatus } from '@/lib/server/feedbackRequests';

export const dynamic = 'force-dynamic';

const MAX_TUTORS = 25;

export async function GET(_request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();
    const studentId = user.id;

    // 1:1 tutors.
    const { data: sessionRows } = await admin
      .from('sessions')
      .select('tutor_id')
      .eq('student_id', studentId)
      .limit(500);

    const via = new Map<string, string>();
    for (const r of (sessionRows ?? []) as unknown as Array<{ tutor_id: string }>) {
      if (r.tutor_id) via.set(r.tutor_id, '1:1 sessions');
    }

    // Group-class tutors. A student can be connected to a tutor through a class
    // without ever having had a 1:1 with them, and §9.2 wants a card either way.
    const [{ data: enrolments }, { data: members }] = await Promise.all([
      admin
        .from('group_enrollments')
        .select('group_id')
        .eq('student_id', studentId)
        .in('status', ['ACTIVE', 'GRACE', 'SECURED'])
        .limit(200),
      admin
        .from('group_members')
        .select('group_id')
        .eq('user_id', studentId)
        .in('status', ['approved', 'active'])
        .limit(200),
    ]);

    const groupIds = Array.from(
      new Set(
        [
          ...((enrolments ?? []) as unknown as Array<{ group_id: string }>),
          ...((members ?? []) as unknown as Array<{ group_id: string }>),
        ].map((r) => r.group_id)
      )
    );

    if (groupIds.length > 0) {
      const { data: groups } = await admin
        .from('groups')
        .select('id, name, tutor_id')
        .in('id', groupIds);

      for (const g of (groups ?? []) as unknown as Array<{
        id: string;
        name: string | null;
        tutor_id: string;
      }>) {
        if (g.tutor_id && !via.has(g.tutor_id)) {
          via.set(g.tutor_id, g.name ?? 'Group class');
        }
      }
    }

    const tutorIds = Array.from(via.keys()).slice(0, MAX_TUTORS);
    if (tutorIds.length === 0) return NextResponse.json({ tutors: [] });

    const { data: profileRows } = await admin
      .from('profiles')
      .select('id, full_name, display_name, username, avatar_url, tutor_verification_status')
      .in('id', tutorIds);

    const profiles = (profileRows ?? []) as unknown as Array<{
      id: string;
      full_name: string | null;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
      tutor_verification_status: string | null;
    }>;

    const quotas = await Promise.all(
      tutorIds.map((tutorId) => getQuotaStatus(admin, { childId: studentId, tutorId }))
    );

    const tutors = tutorIds.map((id, i) => {
      const p = profiles.find((x) => x.id === id);
      const quota = quotas[i];
      return {
        id,
        name: p?.display_name || p?.full_name || p?.username || 'Tutor',
        avatar: p?.avatar_url ?? null,
        // Decision 31: verification status is the only trust attribute shown.
        verified: p?.tutor_verification_status === 'VERIFIED',
        via: via.get(id) ?? null,
        quota: {
          used: quota.used,
          usedBy: quota.usedBy,
          // The plain reason §9.2 asks for, naming who spent it.
          reason: quota.reason,
          nextOpens: quota.nextOpens,
        },
      };
    });

    return NextResponse.json({ tutors });
  } catch (err) {
    console.error('[GET /api/student/my-tutors]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
