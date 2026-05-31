// =====================================================
// TUTOR FILE APPEAL ON STRIKE
// =====================================================
// POST /api/tutor/strikes/:strikeId/appeal
// Body: { text: string }
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { strikeId: string } }
) {
  try {
    const { text } = (await request.json()) as { text?: string };
    if (typeof text !== 'string' || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Appeal text must be at least 20 characters' },
        { status: 400 }
      );
    }

    const serverClient = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    const { data: strike } = await admin
      .from('tutor_strikes')
      .select('id, tutor_id, cleared_at, appeal_status')
      .eq('id', params.strikeId)
      .maybeSingle();

    if (!strike) {
      return NextResponse.json({ error: 'Strike not found' }, { status: 404 });
    }
    if (strike.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (strike.cleared_at) {
      return NextResponse.json(
        { error: 'Strike has already been cleared' },
        { status: 409 }
      );
    }
    if (strike.appeal_status) {
      return NextResponse.json(
        { error: `Strike already has an appeal in '${strike.appeal_status}' state` },
        { status: 409 }
      );
    }

    const { error: updateError } = await admin
      .from('tutor_strikes')
      .update({
        appeal_status: 'pending',
        appeal_text: text.trim(),
        appealed_at: new Date().toISOString(),
      })
      .eq('id', strike.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, appeal_status: 'pending' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to file appeal' },
      { status: 500 }
    );
  }
}
