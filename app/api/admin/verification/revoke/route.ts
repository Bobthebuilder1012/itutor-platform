// =====================================================
// REVOKE TUTOR VERIFICATION (ADMIN)
// =====================================================
// Admin can revoke a tutor's verified status

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const { tutor_id, reason } = body;

    if (!tutor_id) {
      return NextResponse.json({ error: 'tutor_id is required' }, { status: 400 });
    }

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
    }

    // Verify tutor exists and is verified
    const { data: tutor, error: tutorError } = await supabase
      .from('profiles')
      .select('id, full_name, tutor_verification_status')
      .eq('id', tutor_id)
      .eq('role', 'tutor')
      .single();

    if (tutorError || !tutor) {
      console.error('Tutor lookup error:', tutorError);
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });
    }

    if (tutor.tutor_verification_status !== 'VERIFIED') {
      return NextResponse.json({ error: 'Tutor is not verified' }, { status: 400 });
    }

    const serviceSupabase = getServiceClient();

    // Update tutor profile to remove verified status (service role so it always succeeds)
    const { error: updateProfileError } = await serviceSupabase
      .from('profiles')
      .update({
        tutor_verification_status: 'REJECTED',
        tutor_verified_at: null
      })
      .eq('id', tutor_id);

    if (updateProfileError) {
      console.error('Error updating profile:', updateProfileError);
      return NextResponse.json({ error: 'Failed to revoke verification' }, { status: 500 });
    }

    // Hide all verified subjects (set is_public to false)
    try {
      await serviceSupabase
        .from('tutor_verified_subjects')
        .update({ is_public: false })
        .eq('tutor_id', tutor_id);
    } catch (e) {
      console.log('tutor_verified_subjects update skipped:', e);
    }

    // Create notification for tutor
    try {
      await serviceSupabase
        .from('notifications')
        .insert({
          user_id: tutor_id,
          type: 'VERIFICATION_REVOKED',
          message: 'Your verification status has been revoked. Please contact support for more information.',
          data: { 
            reason,
            revoked_by: auth.profile!.id
          }
        });
    } catch (e) {
      // Notification failed but revocation succeeded
      console.error('Failed to create notification:', e);
    }

    return NextResponse.json({
      message: 'Verification revoked successfully',
      tutor_id,
      reason,
      success: true
    });
  } catch (error) {
    console.error('Exception revoking verification:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

