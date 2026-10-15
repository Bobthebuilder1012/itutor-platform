// =====================================================
// REJECT VERIFICATION REQUEST (ADMIN)
// =====================================================
// Admin rejects a verification request with a reason.
//
// This used to strip verified status from any teacher who had one, with the
// write silently failing against the profiles trigger. That is a revoke, not a
// reject, so it now lives in /api/admin/verification/revoke:
//   - rejecting a request that is already APPROVED  -> 409 "use revoke"
//   - rejecting another request of a VERIFIED teacher rejects that request only
//     and leaves the teacher verified (the response says so)

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { applyRequestDecision, decisionActor } from '@/lib/verification/decide';
import { statusErrorResponse } from '@/lib/verification/setStatus';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const serviceSupabase = getServiceClient();
  const requestId = params.id;

  try {
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!reason) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 });
    }

    const { data: verificationRequest, error: fetchError } = await serviceSupabase
      .from('tutor_verification_requests')
      .select('tutor_id, status')
      .eq('id', requestId)
      .maybeSingle();

    if (fetchError) {
      console.error('Error loading request:', fetchError);
      return NextResponse.json({ error: 'Could not load the request' }, { status: 500 });
    }
    if (!verificationRequest) {
      return NextResponse.json({ error: 'Verification request not found' }, { status: 404 });
    }
    if (verificationRequest.status === 'REJECTED') {
      return NextResponse.json({ error: 'Request already rejected' }, { status: 400 });
    }

    const result = await applyRequestDecision({
      requestId,
      decision: 'REJECT',
      actor: decisionActor(auth.profile!),
      reviewerId: auth.profile!.id,
      reason,
      db: serviceSupabase,
    });
    if (!result.ok) return statusErrorResponse(result, result.partial ? { partial: true } : {});

    const { error: notificationError } = await serviceSupabase.from('notifications').insert({
      user_id: result.tutorId,
      type: 'VERIFICATION_REJECTED',
      message: 'Your verification request was not approved. Please review the feedback and resubmit.',
      data: { request_id: requestId, reason },
    });
    if (notificationError) console.error('Failed to create notification:', notificationError.message);

    return NextResponse.json({
      message: 'Verification request rejected',
      reason,
      ...(result.profile.effect === 'unchanged' ? { teacher_status_unchanged: result.profile.note } : {}),
      ...(notificationError ? { notification_error: true } : {}),
    });
  } catch (error) {
    console.error('Exception rejecting verification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
