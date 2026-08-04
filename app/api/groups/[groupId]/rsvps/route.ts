export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor } from '@/lib/auth/groupAccess';

type Params = { params: Promise<{ groupId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await params;
    const service = getServiceClient();

    const { data: sessions } = await service
      .from('group_sessions')
      .select('id, group_session_occurrences(id)')
      .eq('group_id', groupId);

    const occurrenceIds = (sessions ?? [])
      .flatMap((s: any) => (s.group_session_occurrences ?? []).map((o: any) => o.id))
      .filter(Boolean);

    if (occurrenceIds.length === 0) {
      return NextResponse.json({ rsvps: [] });
    }

    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    const isTutor = actor.actingAsTutor;

    if (isTutor) {
      const { data: rsvps } = await service
        .from('session_rsvps')
        .select('id, occurrence_id, student_id, status, reason, updated_at, student:profiles!session_rsvps_student_id_fkey(full_name)')
        .in('occurrence_id', occurrenceIds);
      return NextResponse.json({ rsvps: rsvps ?? [] });
    }

    const { data: rsvps } = await service
      .from('session_rsvps')
      .select('id, occurrence_id, status, reason, updated_at')
      .eq('student_id', user.id)
      .in('occurrence_id', occurrenceIds);

    return NextResponse.json({ rsvps: rsvps ?? [] });
  } catch (err: any) {
    console.error('[GET rsvps]', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
