// =====================================================
// REVIEWER VERIFICATION QUEUE API
// =====================================================
// Get list of verification requests for reviewer

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const statusFilter = searchParams.get('status') || 'READY_FOR_REVIEW';
    const recommendationFilter = searchParams.get('recommendation');

    // Build query
    let query = supabase
      .from('tutor_verification_requests')
      .select(
        `
        *,
        tutor:profiles!tutor_verification_requests_tutor_id_fkey(
          id,
          full_name,
          display_name,
          email
        )
      `
      )
      .order('created_at', { ascending: true });

    // Apply filters
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    if (recommendationFilter) {
      query = query.eq('system_recommendation', recommendationFilter);
    }

    const { data: requests, error: requestsError } = await query;

    if (requestsError) {
      console.error('Error fetching verification requests:', requestsError);
      return NextResponse.json(
        { error: 'Failed to fetch verification requests' },
        { status: 500 }
      );
    }

    // Generate signed URLs for file preview
    const requestsWithUrls = await Promise.all(
      (requests || []).map(async (req) => {
        let previewUrl = null;

        try {
          const { data: urlData, error: urlError } = await supabase.storage
            .from('verification_uploads')
            .createSignedUrl(req.file_path, 3600); // 1 hour expiry

          if (!urlError && urlData) {
            previewUrl = urlData.signedUrl;
          }
        } catch (err) {
          console.error('Error generating signed URL:', err);
        }

        return {
          ...req,
          previewUrl,
        };
      })
    );

    return NextResponse.json({
      success: true,
      requests: requestsWithUrls,
      total: requestsWithUrls.length,
      filters: {
        status: statusFilter,
        recommendation: recommendationFilter,
      },
    });
  } catch (error: any) {
    console.error('Reviewer queue error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}












