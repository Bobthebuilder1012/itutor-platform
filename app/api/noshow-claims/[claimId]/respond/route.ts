// =====================================================
// RESPOND TO A NO-SHOW CLAIM
// =====================================================
// POST /api/noshow-claims/:claimId/respond
// Body: {
//   response: string,
//   evidenceFiles?: Array<{ path: string; original_name?: string; size?: number; type?: string }>
// }
//
// Defendant submits counter-evidence within the 12 h window. Moves
// the claim to 'pending_admin' so it lands in the admin queue.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Body {
  response?: string;
  evidenceFiles?: Array<{ path: string; original_name?: string; size?: number; type?: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { claimId: string } }
) {
  try {
    const body = (await request.json()) as Body;
    if (typeof body.response !== 'string' || body.response.trim().length < 20) {
      return NextResponse.json(
        { error: 'response must be at least 20 characters' },
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

    const { data: claim } = await admin
      .from('noshow_claims')
      .select('id, defendant_id, claimant_id, status, response_deadline')
      .eq('id', params.claimId)
      .maybeSingle();

    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }
    if (claim.defendant_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (claim.status !== 'awaiting_response') {
      return NextResponse.json(
        { error: `Claim is already in '${claim.status}' state` },
        { status: 409 }
      );
    }

    const { error: updateError } = await admin
      .from('noshow_claims')
      .update({
        defendant_response: body.response.trim(),
        defendant_evidence_files: body.evidenceFiles ?? [],
        defendant_responded_at: new Date().toISOString(),
        status: 'pending_admin',
      })
      .eq('id', claim.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    try {
      await admin.from('notifications').insert({
        user_id: claim.claimant_id,
        type: 'noshow_claim_response',
        title: 'The other party responded',
        message: 'Your no-show claim is now under admin review.',
        link: '/student/disputes',
      });
    } catch (e) {
      console.error('noshow-claims/respond: notification insert failed', e);
    }

    return NextResponse.json({ success: true, status: 'pending_admin' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to respond' },
      { status: 500 }
    );
  }
}
