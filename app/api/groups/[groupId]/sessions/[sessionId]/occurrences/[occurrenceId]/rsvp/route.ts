export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; sessionId: string; occurrenceId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId, occurrenceId } = await params;
    const service = getServiceClient();

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isTutor = group.tutor_id === user.id;

    if (isTutor) {
      const { data: rsvps } = await service
        .from('session_rsvps')
        .select('id, occurrence_id, student_id, status, reason, updated_at, student:profiles!session_rsvps_student_id_fkey(full_name, avatar_url)')
        .eq('occurrence_id', occurrenceId);
      return NextResponse.json({ rsvps: rsvps ?? [] });
    }

    const { data: rsvp } = await service
      .from('session_rsvps')
      .select('id, status, reason, updated_at')
      .eq('occurrence_id', occurrenceId)
      .eq('student_id', user.id)
      .maybeSingle();

    return NextResponse.json({ rsvp: rsvp ?? null });
  } catch (err: any) {
    console.error('[GET rsvp]', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId, occurrenceId } = await params;
    const service = getServiceClient();

    const { data: membership } = await service
      .from('group_members')
      .select('status')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.status !== 'approved') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const body = await req.json();
    const status = body.status as string;
    const reason = (body.reason as string | undefined)?.trim() || null;

    if (status !== 'attending' && status !== 'not_attending') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { data, error } = await service
      .from('session_rsvps')
      .upsert(
        {
          occurrence_id: occurrenceId,
          student_id: user.id,
          status,
          reason: status === 'attending' ? null : reason,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'occurrence_id,student_id' }
      )
      .select('id, status, reason, updated_at')
      .single();

    if (error) throw error;

    return NextResponse.json({ rsvp: data });
  } catch (err: any) {
    console.error('[PUT rsvp]', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
