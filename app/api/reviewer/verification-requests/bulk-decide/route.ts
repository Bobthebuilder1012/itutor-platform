// =====================================================
// REVIEWER BULK DECISION API
// =====================================================
// Reviewer makes decisions on multiple verification requests at once

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sendEmail } from '@/lib/services/emailService';
import { verificationCongratulationsEmail } from '@/lib/email-templates/tutor';

export async function POST(request: NextRequest) {
  const results: {
    success: { requestId: string | number; tutorId: string }[];
    failed: { requestId: string | number; error: string }[];
  } = {
    success: [],
    failed: [],
  };
  
  try {
    const { request_ids, decision, global_reviewer_reason } =
      await request.json();

    // Validate input
    if (!request_ids || !Array.isArray(request_ids) || request_ids.length === 0) {
      return NextResponse.json(
        { error: 'request_ids array is required' },
        { status: 400 }
      );
    }

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

    // Check if user is a reviewer or admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_reviewer, role')
      .eq('id', user.id)
      .single();

    if (profileError || (!profile?.is_reviewer && profile?.role !== 'admin')) {
      return NextResponse.json(
        { error: 'Access denied. Reviewer or admin role required.' },
        { status: 403 }
      );
    }

    // Use service role for bulk operations
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get all verification requests
    const { data: requests, error: requestsError } = await serviceSupabase
      .from('tutor_verification_requests')
      .select('*')
      .in('id', request_ids)
      .eq('status', 'READY_FOR_REVIEW');

    if (requestsError) {
      console.error('Error fetching verification requests:', requestsError);
      return NextResponse.json(
        { error: 'Failed to fetch verification requests' },
        { status: 500 }
      );
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json(
        { error: 'No valid requests found to process' },
        { status: 404 }
      );
    }

    // Check if any requests have system recommendation APPROVE and decision is REJECT
    // If so, require global_reviewer_reason
    if (decision === 'REJECT') {
      const hasApproveRecommendations = requests.some(
        (req) => req.system_recommendation === 'APPROVE'
      );

      if (
        hasApproveRecommendations &&
        (!global_reviewer_reason || global_reviewer_reason.trim().length === 0)
      ) {
        const conflictingRequests = requests
          .filter((req) => req.system_recommendation === 'APPROVE')
          .map((req) => req.id);

        return NextResponse.json(
          {
            error:
              'Global reviewer reason is required when bulk rejecting requests that were system-recommended for approval',
            conflicting_request_ids: conflictingRequests,
          },
          { status: 400 }
        );
      }
    }

    // Process each request
    for (const req of requests) {
      try {
        // Determine reason to use
        const reasonToUse = global_reviewer_reason || req.system_reason || null;

        // Update verification request
        const { error: updateError } = await serviceSupabase
          .from('tutor_verification_requests')
          .update({
            status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            reviewed_by: user.id,
            reviewer_decision: decision,
            reviewer_reason: reasonToUse,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', req.id);

        if (updateError) {
          results.failed.push({
            requestId: req.id,
            error: updateError.message,
          });
          continue;
        }

        // Update tutor profile
        const newProfileStatus =
          decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
        await serviceSupabase
          .from('profiles')
          .update({
            tutor_verification_status: newProfileStatus,
            tutor_verified_at:
              decision === 'APPROVE' ? new Date().toISOString() : null,
          })
          .eq('id', req.tutor_id);

        // Create notification
        const notificationMessage =
          decision === 'APPROVE'
            ? 'Your verification was approved. You now have a verified badge!'
            : `Your verification was rejected. ${reasonToUse || 'Please review the requirements and try again.'}`;

        await serviceSupabase.from('notifications').insert({
          user_id: req.tutor_id,
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

        if (decision === 'APPROVE') {
          const { data: tutorProfile } = await serviceSupabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', req.tutor_id)
            .single();
          if (tutorProfile?.email) {
            const firstName = tutorProfile.full_name?.split(' ')[0] || 'there';
            const template = verificationCongratulationsEmail(firstName);
            const emailResult = await sendEmail({
              to: tutorProfile.email,
              subject: template.subject,
              html: template.html,
            });
            if (!emailResult.success) {
              console.error('Failed to send verification congratulations email:', emailResult.error);
            }
          }
        }

        // Log events
        await serviceSupabase.from('tutor_verification_events').insert([
          {
            request_id: req.id,
            event_type: 'REVIEWER_DECISION',
            payload: {
              reviewer_id: user.id,
              decision,
              reviewer_reason: reasonToUse,
              system_recommendation: req.system_recommendation,
              bulk_action: true,
            },
          },
          {
            request_id: req.id,
            event_type: 'NOTIFIED',
            payload: {
              notification_type:
                decision === 'APPROVE'
                  ? 'VERIFICATION_APPROVED'
                  : 'VERIFICATION_REJECTED',
              tutor_id: req.tutor_id,
              bulk_action: true,
            },
          },
        ]);

        results.success.push({
          requestId: req.id,
          tutorId: req.tutor_id,
        });
      } catch (error: any) {
        results.failed.push({
          requestId: req.id,
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      decision,
      results: {
        total: request_ids.length,
        processed: results.success.length,
        failed: results.failed.length,
        successfulRequests: results.success,
        failedRequests: results.failed,
      },
    });
  } catch (error: any) {
    console.error('Bulk decision error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}






