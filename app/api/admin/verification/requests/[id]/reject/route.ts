// =====================================================
// REJECT VERIFICATION REQUEST (ADMIN)
// =====================================================
// Admin rejects verification request with reason

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
    // Parse request body
    const body = await request.json();
    const { reason } = body;

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    // Get verification request
    const { data: verificationRequest, error: fetchError } = await supabase
      .from('tutor_verification_requests')
      .select('tutor_id, status')
      .eq('id', requestId)
      .single();

    if (fetchError || !verificationRequest) {
      return NextResponse.json({ error: 'Verification request not found' }, { status: 404 });
    }

    if (verificationRequest.status === 'REJECTED') {
      return NextResponse.json({ error: 'Request already rejected' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Update verification request status
    const { error: updateError } = await supabase
      .from('tutor_verification_requests')
      .update({
        status: 'REJECTED',
        reviewer_decision: 'REJECT',
        reviewer_reason: reason,
        reviewed_by: auth.profile!.id,
        reviewed_at: now
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Error rejecting request:', updateError);
      return NextResponse.json({ error: 'Failed to reject request' }, { status: 500 });
    }

    // If tutor was previously verified, remove their verified status
    const { data: tutorProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('tutor_verification_status')
      .eq('id', verificationRequest.tutor_id)
      .single();

    if (!profileCheckError && tutorProfile?.tutor_verification_status === 'VERIFIED') {
      // Remove verified status
      await supabase
        .from('profiles')
        .update({
          tutor_verification_status: null,
          tutor_verified_at: null
        })
        .eq('id', verificationRequest.tutor_id);

      // Hide all their verified subjects (if table exists)
      try {
        await supabase
          .from('tutor_verified_subjects')
          .update({ is_public: false })
          .eq('tutor_id', verificationRequest.tutor_id);
      } catch (e) {
        console.log('tutor_verified_subjects table may not exist yet');
      }
    }

    // Create notification for tutor
    await supabase
      .from('notifications')
      .insert({
        user_id: verificationRequest.tutor_id,
        type: 'VERIFICATION_REJECTED',
        message: 'Your verification request was not approved. Please review the feedback and resubmit.',
        data: { 
          request_id: requestId,
          reason
        }
      });

    return NextResponse.json({
      message: 'Verification request rejected',
      reason
    });
  } catch (error) {
    console.error('Exception rejecting verification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

