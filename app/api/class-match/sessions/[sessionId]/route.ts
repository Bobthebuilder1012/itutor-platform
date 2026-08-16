import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { mintCampaignMeetLink } from '@/lib/classMatchWeek/meetLink';

type Params = { params: Promise<{ sessionId: string }> };
export const dynamic = 'force-dynamic';

// PATCH /api/class-match/sessions/[sessionId] — { action: 'cancel' | 'publish' }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { sessionId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (action !== 'cancel' && action !== 'publish') {
      return NextResponse.json({ error: 'invalid_field', field: 'action' }, { status: 400 });
    }

    const service = getServiceClient();

    const { data: session } = await service
      .from('class_match_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (session.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (action === 'cancel') {
      if (session.status === 'cancelled') {
        return NextResponse.json({ error: 'already_cancelled' }, { status: 409 });
      }

      // Status and timestamp move together — the table CHECK requires it, and
      // setting one without the other is a constraint violation, not a partial
      // cancel. NO email goes out here, deliberately (docs 01 §1.5): the floor
      // is that a cancelled session stops presenting as upcoming and its join
      // route refuses, so the platform never directs families to an empty
      // room. Notifying them is a courtesy layered on later, not a dependency.
      const { data: updated, error } = await service
        .from('class_match_sessions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ session: updated });
    }

    // action === 'publish'
    if (session.status !== 'draft') {
      return NextResponse.json({ error: 'not_draft' }, { status: 409 });
    }

    // Same contract as POST with publish: true — the room is minted before the
    // status flips, so a published session can never exist without a link.
    const minted = await mintCampaignMeetLink(service, {
      tutorId: user.id,
      title: session.title,
      scheduledAt: session.scheduled_at,
      durationMinutes: session.duration_minutes,
    });
    if (!minted.ok) {
      return NextResponse.json(
        { error: 'meet_link_failed', reason: minted.reason, reconnectUrl: minted.reconnectUrl },
        { status: 422 }
      );
    }

    const { data: updated, error } = await service
      .from('class_match_sessions')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        meet_link: minted.url,
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ session: updated });
  } catch (err) {
    console.error('[PATCH class-match/sessions/[sessionId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
