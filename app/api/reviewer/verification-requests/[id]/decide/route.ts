// =====================================================
// REVIEWER DECISION API (SINGLE)
// =====================================================
// Reviewer makes final decision on a verification request

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { decision, reviewer_reason } = await request.json();
    const requestId = params.id;

    // Validate decision
    if (!decision || !['APPROVE', 'REJECT'].includes(decision)) {
      return NextResponse.json(
        { error: 'Decision must be "APPROVE" or "REJECT"' },
        { status: 400 }
      );
    }

    // Initialize Supabase client with user session
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

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a reviewer
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_reviewer')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_reviewer) {
      return NextResponse.json(
        { error: 'Access denied. Reviewer role required.' },
        { status: 403 }
      );
    }

    // Get verification request
    const { data: verificationRequest, error: requestError } = await supabase
      .from('tutor_verification_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !verificationRequest) {
      return NextResponse.json(
        { error: 'Verification request not found' },
        { status: 404 }
      );
    }

    // Check status
    if (verificationRequest.status !== 'READY_FOR_REVIEW') {
      return NextResponse.json(
        {
          error: `Request cannot be reviewed in status: ${verificationRequest.status}`,
        },
        { status: 400 }
      );
    }

    // Validation: If system recommended APPROVE and reviewer is REJECTING, reason is REQUIRED
    if (
      verificationRequest.system_recommendation === 'APPROVE' &&
      decision === 'REJECT' &&
      (!reviewer_reason || reviewer_reason.trim().length === 0)
    ) {
      return NextResponse.json(
        {
          error:
            'Reviewer reason is required when rejecting a system-recommended approval',
        },
        { status: 400 }
      );
    }

    // Use service role for updates
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Update verification request
    const { error: updateError } = await serviceSupabase
      .from('tutor_verification_requests')
      .update({
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewed_by: user.id,
        reviewer_decision: decision,
        reviewer_reason: reviewer_reason || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Error updating verification request:', updateError);
      return NextResponse.json(
        { error: 'Failed to update verification request' },
        { status: 500 }
      );
    }

    // Update tutor profile status
    const newProfileStatus = decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
    const { error: profileUpdateError } = await serviceSupabase
      .from('profiles')
      .update({
        tutor_verification_status: newProfileStatus,
        tutor_verified_at:
          decision === 'APPROVE' ? new Date().toISOString() : null,
      })
      .eq('id', verificationRequest.tutor_id);

    if (profileUpdateError) {
      console.error('Error updating tutor profile:', profileUpdateError);
    }

    // Create notification for tutor
    const notificationMessage =
      decision === 'APPROVE'
        ? 'Your verification was approved. You now have a verified badge!'
        : `Your verification was rejected. ${reviewer_reason || verificationRequest.system_reason || 'Please review the requirements and try again.'}`;

    const { error: notificationError } = await serviceSupabase
      .from('notifications')
      .insert({
        user_id: verificationRequest.tutor_id,
        type:
          decision === 'APPROVE'
            ? 'VERIFICATION_APPROVED'
            : 'VERIFICATION_REJECTED',
        title:
          decision === 'APPROVE'
            ? 'Verification Approved ✓'
            : 'Verification Not Approved',
        message: notificationMessage,
        link: '/tutor/dashboard',
        created_at: new Date().toISOString(),
      });

    if (notificationError) {
      console.error('Error creating notification:', notificationError);
    }

    // Log event
    await serviceSupabase.from('tutor_verification_events').insert({
      request_id: requestId,
      event_type: 'REVIEWER_DECISION',
      payload: {
        reviewer_id: user.id,
        decision,
        reviewer_reason,
        system_recommendation: verificationRequest.system_recommendation,
      },
    });

    // Log notification event
    await serviceSupabase.from('tutor_verification_events').insert({
      request_id: requestId,
      event_type: 'NOTIFIED',
      payload: {
        notification_type:
          decision === 'APPROVE'
            ? 'VERIFICATION_APPROVED'
            : 'VERIFICATION_REJECTED',
        tutor_id: verificationRequest.tutor_id,
      },
    });

    return NextResponse.json({
      success: true,
      decision,
      requestId,
      tutorId: verificationRequest.tutor_id,
      message: `Verification ${decision === 'APPROVE' ? 'approved' : 'rejected'} successfully`,
    });
  } catch (error: any) {
    console.error('Reviewer decision error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}







