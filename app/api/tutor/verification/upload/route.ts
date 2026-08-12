// =====================================================
// UPLOAD CXC VERIFICATION DOCUMENT
// =====================================================
// Tutors upload their CXC results slip for verification
// Validation: PDF/JPG/PNG, max 5MB, rate limit 1 per day

import { NextRequest, NextResponse } from 'next/server';
import { requireTutor } from '@/lib/middleware/tutorAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireTutor();
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
  const tutorId = auth.profile!.id;

  try {
    // A pending review no longer blocks a new upload.
    //
    // It used to 429 for 7 days, which stranded any tutor who uploaded the
    // wrong file, a blurry scan, or the wrong side of a results slip: their
    // only options were to wait out the week or ask support. Uploading again
    // now REPLACES the pending request — the newest document is the one that
    // gets reviewed.
    //
    // Replace rather than stack: two pending requests for one tutor is a trap,
    // because rejecting either one wipes the tutor's badge and hides every
    // verified subject if the other has already been approved (see
    // app/api/admin/verification/requests/[id]/reject). Keeping exactly one
    // pending request per tutor leaves that behaviour untouched.
    const { data: pendingSubmissions, error: checkError } = await supabase
      .from('tutor_verification_requests')
      .select('id, status, created_at')
      .eq('tutor_id', tutorId)
      .in('status', ['SUBMITTED', 'PROCESSING', 'READY_FOR_REVIEW'])
      .order('created_at', { ascending: false });

    if (checkError) {
      console.error('Error checking pending submissions:', checkError);
      return NextResponse.json({ error: 'Failed to check submission status' }, { status: 500 });
    }

    // Superseding happens AFTER the new document is safely stored, further
    // down. Cancelling the old request first (as the old >7-day path did) means
    // a failed upload leaves the tutor with nothing under review at all —
    // strictly worse than the request they started with.
    const supersededIds = (pendingSubmissions ?? []).map((r) => r.id);

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF, JPG, and PNG are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 5MB limit.' },
        { status: 400 }
      );
    }

    // Create verification request record first
    console.log('Creating verification request for tutor:', tutorId);
    const { data: request_record, error: insertError } = await supabase
      .from('tutor_verification_requests')
      .insert({
        tutor_id: tutorId,
        status: 'SUBMITTED',
        file_type: file.type.startsWith('image') ? 'image' : 'pdf',
        original_filename: file.name,
        file_path: '' // Will update after upload
      })
      .select()
      .single();

    if (insertError || !request_record) {
      console.error('Error creating verification request:', insertError);
      console.error('Insert error details:', JSON.stringify(insertError, null, 2));
      return NextResponse.json({ 
        error: 'Failed to create verification request',
        details: insertError?.message || 'Unknown error',
        hint: insertError?.hint
      }, { status: 500 });
    }
    
    console.log('Created verification request:', request_record.id);

    // Upload file to storage
    const fileExt = file.name.split('.').pop();
    const filePath = `${tutorId}/requests/${request_record.id}.${fileExt}`;
    
    console.log('Uploading file to storage:', filePath);
    const { error: uploadError } = await supabase.storage
      .from('tutor-verifications')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      console.error('Upload error details:', JSON.stringify(uploadError, null, 2));
      // Clean up the request record
      await supabase
        .from('tutor_verification_requests')
        .delete()
        .eq('id', request_record.id);
      
      return NextResponse.json({ 
        error: 'Failed to upload file',
        details: uploadError?.message || 'Unknown error',
        hint: 'Storage bucket may not exist. Run migrations 032-033.'
      }, { status: 500 });
    }
    
    console.log('File uploaded successfully');

    // Update request with file path
    console.log('Updating request with file path');
    const { error: updateError } = await supabase
      .from('tutor_verification_requests')
      .update({ file_path: filePath })
      .eq('id', request_record.id);

    if (updateError) {
      console.error('Error updating file path:', updateError);
      console.error('Update error details:', JSON.stringify(updateError, null, 2));
    }

    // The new document is stored, so retire whatever was pending before it.
    // Recorded as REJECTED with an explicit reason because the status CHECK
    // constraint (migration 024) has no SUPERSEDED value and the admin queue
    // filters on these statuses — the same shape the old expiry path used.
    // Note this is a direct write, NOT the admin reject route, so it cannot
    // strip an existing verified badge.
    if (supersededIds.length > 0) {
      console.log('Superseding pending verification requests:', supersededIds);
      const { error: supersedeError } = await supabase
        .from('tutor_verification_requests')
        .update({
          status: 'REJECTED',
          reviewer_reason: 'Superseded — the tutor uploaded a newer document before this was reviewed.',
          reviewed_at: new Date().toISOString(),
        })
        .in('id', supersededIds);

      // Non-fatal: the tutor's new document is already in the queue. Leaving a
      // stale row behind is a tidiness problem, not a broken submission.
      if (supersedeError) {
        console.error('Failed to supersede previous requests:', supersedeError.message);
      }
    }

    console.log('✅ Upload complete! Request ID:', request_record.id);
    return NextResponse.json({
      message: 'Verification document uploaded successfully',
      request_id: request_record.id,
      status: 'SUBMITTED',
      superseded_count: supersededIds.length,
      success: true
    });
  } catch (error) {
    console.error('Exception uploading verification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

