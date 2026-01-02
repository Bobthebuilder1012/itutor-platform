// =====================================================
// APPROVE VERIFICATION REQUEST (ADMIN)
// =====================================================
// Admin approves verification request and updates tutor status

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
  const requestId = params.id;

  try {
    // Get verification request
    const { data: verificationRequest, error: fetchError } = await supabase
      .from('tutor_verification_requests')
      .select('tutor_id, status')
      .eq('id', requestId)
      .single();

    if (fetchError || !verificationRequest) {
      return NextResponse.json({ error: 'Verification request not found' }, { status: 404 });
    }

    if (verificationRequest.status === 'APPROVED') {
      return NextResponse.json({ error: 'Request already approved' }, { status: 400 });
    }

    // Check if any verified subjects were added
    const { data: verifiedSubjects, error: subjectsError } = await supabase
      .from('tutor_verified_subjects')
      .select('id')
      .eq('source_request_id', requestId);

    if (subjectsError || !verifiedSubjects || verifiedSubjects.length === 0) {
      return NextResponse.json(
        { error: 'Cannot approve: No verified subjects added to this request' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Update verification request status
    const { error: updateRequestError } = await supabase
      .from('tutor_verification_requests')
      .update({
        status: 'APPROVED',
        reviewer_decision: 'APPROVE',
        reviewed_by: auth.profile!.id,
        reviewed_at: now
      })
      .eq('id', requestId);

    if (updateRequestError) {
      console.error('Error updating request:', updateRequestError);
      return NextResponse.json({ error: 'Failed to approve request' }, { status: 500 });
    }

    // Update tutor profile verification status
    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({
        tutor_verification_status: 'VERIFIED',
        tutor_verified_at: now
      })
      .eq('id', verificationRequest.tutor_id);

    if (updateProfileError) {
      console.error('Error updating profile:', updateProfileError);
      return NextResponse.json({ error: 'Failed to update tutor status' }, { status: 500 });
    }

    // Create notification for tutor
    await supabase
      .from('notifications')
      .insert({
        user_id: verificationRequest.tutor_id,
        type: 'VERIFICATION_APPROVED',
        message: 'Your verification has been approved! You are now a verified tutor.',
        data: { request_id: requestId }
      });

    return NextResponse.json({
      message: 'Verification request approved successfully',
      tutor_status: 'VERIFIED'
    });
  } catch (error) {
    console.error('Exception approving verification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

