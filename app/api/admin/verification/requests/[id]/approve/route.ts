// =====================================================
// APPROVE VERIFICATION REQUEST (ADMIN)
// =====================================================
// Admin approves verification request and updates tutor status.
// Status changes go through lib/verification/decide.ts (allowed-transition map).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/services/emailService';
import { verificationCongratulationsEmail } from '@/lib/email-templates/tutor';
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

    if (verificationRequest.status === 'APPROVED') {
      return NextResponse.json({ error: 'Request already approved' }, { status: 400 });
    }

    // Check if any verified subjects were added
    const { data: verifiedSubjects, error: subjectsError } = await serviceSupabase
      .from('tutor_verified_subjects')
      .select('id')
      .eq('source_request_id', requestId);

    if (subjectsError) {
      console.error('Error checking verified subjects:', subjectsError);
      return NextResponse.json({ error: 'Could not check the verified subjects' }, { status: 500 });
    }
    if (!verifiedSubjects || verifiedSubjects.length === 0) {
      return NextResponse.json(
        { error: 'Cannot approve: No verified subjects added to this request' },
        { status: 400 }
      );
    }

    const result = await applyRequestDecision({
      requestId,
      decision: 'APPROVE',
      actor: decisionActor(auth.profile!),
      reviewerId: auth.profile!.id,
      db: serviceSupabase,
    });
    if (!result.ok) return statusErrorResponse(result, result.partial ? { partial: true } : {});

    // Notification for the tutor. The status change is already saved, so a
    // failure here is reported in the response rather than undoing it.
    const { error: notificationError } = await serviceSupabase.from('notifications').insert({
      user_id: result.tutorId,
      type: 'VERIFICATION_APPROVED',
      message: 'Your verification has been approved! You are now a verified tutor.',
      data: { request_id: requestId },
    });
    if (notificationError) console.error('Failed to create notification:', notificationError.message);

    // Congratulations email (existing behaviour, unchanged)
    const { data: tutorProfile } = await serviceSupabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', result.tutorId)
      .maybeSingle();

    if (tutorProfile?.email) {
      const firstName = tutorProfile.full_name?.split(' ')[0] || 'there';
      const template = verificationCongratulationsEmail(firstName);
      const emailResult = await sendEmail({
        to: tutorProfile.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
      if (!emailResult.success) {
        console.error('Failed to send verification congratulations email:', emailResult.error);
      }
    }

    return NextResponse.json({
      message: 'Verification request approved successfully',
      tutor_status: 'VERIFIED',
      ...(notificationError ? { notification_error: true } : {}),
    });
  } catch (error) {
    console.error('Exception approving verification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
