// =====================================================
// GET SINGLE VERIFICATION REQUEST (ADMIN)
// =====================================================
// Returns detailed verification request with document URL

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(
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
    // Fetch request details
    const { data: requestData, error: requestError } = await supabase
      .from('tutor_verification_requests')
      .select(`
        *,
        tutor:tutor_id (
          id,
          full_name,
          email,
          phone_number
        ),
        reviewer:reviewed_by (
          id,
          full_name
        )
      `)
      .eq('id', requestId)
      .single();

    if (requestError || !requestData) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Generate signed URL for document (try both buckets: tutor flow uses verification_uploads, upload page uses tutor-verifications)
    let documentUrl = null;
    if (requestData.file_path) {
      const bucketsToTry = ['tutor-verifications', 'verification_uploads'] as const;
      for (const bucket of bucketsToTry) {
        try {
          const { data: signedUrl, error: urlError } = await supabase.storage
            .from(bucket)
            .createSignedUrl(requestData.file_path, 3600);

          if (!urlError && signedUrl?.signedUrl) {
            documentUrl = signedUrl.signedUrl;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!documentUrl) {
        console.warn('⚠️ Could not generate signed URL for file_path in any bucket:', requestData.file_path);
      }
    } else {
      console.warn('⚠️ No file_path in request data');
    }

    // Fetch verified subjects added for this request
    const { data: verifiedSubjects, error: subjectsError } = await supabase
      .from('tutor_verified_subjects')
      .select(`
        *,
        subjects:subject_id (
          id,
          name,
          curriculum,
          level
        )
      `)
      .eq('source_request_id', requestId)
      .order('created_at', { ascending: false });

    if (subjectsError) {
      console.error('Error fetching verified subjects:', subjectsError);
    }

    return NextResponse.json({
      request: {
        ...requestData,
        document_url: documentUrl
      },
      verified_subjects: verifiedSubjects || []
    });
  } catch (error) {
    console.error('Exception fetching verification request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

