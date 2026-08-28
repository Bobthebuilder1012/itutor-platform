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
    // A pending review does not block a new upload. Documents queue: a tutor
    // can submit several and a reviewer decides each one on its own.
    //
    // This used to 429 for 7 days, which stranded anyone who uploaded the wrong
    // file, a blurry scan, or the wrong side of a results slip — their only
    // options were to wait out the week or ask support.

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

    console.log('✅ Upload complete! Request ID:', request_record.id);
    return NextResponse.json({
      message: 'Verification document uploaded successfully',
      request_id: request_record.id,
      status: 'SUBMITTED',
      success: true
    });
  } catch (error) {
    console.error('Exception uploading verification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

