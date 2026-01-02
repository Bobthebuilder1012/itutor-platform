// =====================================================
// VERIFICATION REQUEST CREATION API
// =====================================================
// Creates a verification request and generates signed upload URL

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { fileType, originalFilename } = await request.json();

    if (!fileType || !originalFilename) {
      return NextResponse.json(
        { error: 'fileType and originalFilename are required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!['image', 'pdf'].includes(fileType)) {
      return NextResponse.json(
        { error: 'fileType must be "image" or "pdf"' },
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

    // Check if user is a tutor
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, tutor_verification_status')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    if (profile.role !== 'tutor') {
      return NextResponse.json(
        { error: 'Only tutors can submit verification requests' },
        { status: 403 }
      );
    }

    // Create verification request record
    const requestId = crypto.randomUUID();
    const filePath = `${user.id}/${requestId}/${originalFilename}`;

    const { data: verificationRequest, error: requestError } = await supabase
      .from('tutor_verification_requests')
      .insert({
        id: requestId,
        tutor_id: user.id,
        status: 'SUBMITTED',
        file_path: filePath,
        file_type: fileType,
        original_filename: originalFilename,
      })
      .select()
      .single();

    if (requestError) {
      console.error('Error creating verification request:', requestError);
      return NextResponse.json(
        { error: 'Failed to create verification request' },
        { status: 500 }
      );
    }

    // Update profile status to PENDING
    await supabase
      .from('profiles')
      .update({ tutor_verification_status: 'PENDING' })
      .eq('id', user.id);

    // Generate signed upload URL
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('verification_uploads')
      .createSignedUploadUrl(filePath);

    if (uploadError) {
      console.error('Error creating signed upload URL:', uploadError);
      return NextResponse.json(
        { error: 'Failed to generate upload URL' },
        { status: 500 }
      );
    }

    // Log event
    await supabase.from('tutor_verification_events').insert({
      request_id: requestId,
      event_type: 'SUBMITTED',
      payload: {
        tutor_id: user.id,
        file_path: filePath,
        file_type: fileType,
      },
    });

    return NextResponse.json({
      success: true,
      requestId: verificationRequest.id,
      uploadUrl: uploadData.signedUrl,
      uploadPath: filePath,
      message: 'Verification request created. Please upload your document.',
    });
  } catch (error: any) {
    console.error('Verification request error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// Get verification status for current user
export async function GET(request: NextRequest) {
  try {
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get profile verification status
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tutor_verification_status, tutor_verified_at')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Get latest verification request
    const { data: requests, error: requestsError } = await supabase
      .from('tutor_verification_requests')
      .select('*')
      .eq('tutor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (requestsError) {
      console.error('Error fetching verification requests:', requestsError);
    }

    const latestRequest = requests && requests.length > 0 ? requests[0] : null;

    return NextResponse.json({
      verificationStatus: profile.tutor_verification_status,
      verifiedAt: profile.tutor_verified_at,
      latestRequest: latestRequest
        ? {
            id: latestRequest.id,
            status: latestRequest.status,
            system_recommendation: latestRequest.system_recommendation,
            system_reason: latestRequest.system_reason,
            reviewer_reason: latestRequest.reviewer_reason,
            reviewed_at: latestRequest.reviewed_at,
            created_at: latestRequest.created_at,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Get verification status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

