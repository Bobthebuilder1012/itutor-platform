// =====================================================
// REVOKE TUTOR VERIFICATION (ADMIN)
// =====================================================
// The only way to take verified status away. Writes REVOKED (it used to write
// REJECTED). Who may do it is config/verificationPolicy.ts (admin role only).
// A revoked teacher cannot be moved back by any upload or review flow.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { decisionActor } from '@/lib/verification/decide';
import { setProfileStatus, setV2Status, statusErrorResponse } from '@/lib/verification/setStatus';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const tutor_id: string | undefined = body?.tutor_id;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!tutor_id) {
      return NextResponse.json({ error: 'tutor_id is required' }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
    }

    const serviceSupabase = getServiceClient();
    const actor = decisionActor(auth.profile!);

    const { data: tutor, error: tutorError } = await serviceSupabase
      .from('profiles')
      .select('id')
      .eq('id', tutor_id)
      .eq('role', 'tutor')
      .maybeSingle();

    if (tutorError) {
      console.error('Tutor lookup error:', tutorError);
      return NextResponse.json({ error: 'Could not look up the tutor' }, { status: 500 });
    }
    if (!tutor) {
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });
    }

    // VERIFIED -> REVOKED. The map refuses anything else, and refuses a
    // non-admin actor (policy), with a clear code.
    const revoked = await setProfileStatus({ tutorId: tutor_id, to: 'REVOKED', actor, db: serviceSupabase });
    if (!revoked.ok) return statusErrorResponse(revoked);

    // Keep the new flow consistent: a verified v2 record is revoked with it.
    const warnings: string[] = [];
    const v2 = await setV2Status({
      tutorId: tutor_id,
      to: 'REVOKED',
      actor,
      reviewerId: auth.profile!.id,
      reason,
      db: serviceSupabase,
    });
    if (!v2.ok && v2.code !== 'not_found' && v2.code !== 'transition_not_allowed') {
      console.error('[revoke] v2 record not revoked:', v2.message);
      warnings.push('The new-flow record could not be revoked.');
    }

    // Hide every public verified subject. A failure is returned, not logged away.
    const { error: hideError } = await serviceSupabase
      .from('tutor_verified_subjects')
      .update({ is_public: false })
      .eq('tutor_id', tutor_id);
    if (hideError) {
      console.error('[revoke] could not hide verified subjects:', hideError.message);
      return NextResponse.json(
        {
          error: 'Verification was revoked but the public subjects could not be hidden. Retry the hide step.',
          partial: true,
        },
        { status: 500 }
      );
    }

    const { error: notificationError } = await serviceSupabase.from('notifications').insert({
      user_id: tutor_id,
      type: 'VERIFICATION_REVOKED',
      message: 'Your verification status has been revoked. Please contact support for more information.',
      data: { reason, revoked_by: auth.profile!.id },
    });
    if (notificationError) console.error('Failed to create notification:', notificationError.message);

    return NextResponse.json({
      message: 'Verification revoked successfully',
      tutor_id,
      reason,
      success: true,
      ...(warnings.length ? { warnings } : {}),
      ...(notificationError ? { notification_error: true } : {}),
    });
  } catch (error) {
    console.error('Exception revoking verification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
