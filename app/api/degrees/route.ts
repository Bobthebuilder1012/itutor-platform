import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabase } from '@/lib/api/supabaseRouteClient';
import {
  ALLOWED_DEGREE_MIME,
  DEGREE_DOC_BUCKET,
  MAX_DEGREE_FILE_BYTES,
} from '@/lib/degrees/constants';
import { parseGraduationYear, validateDegreeText } from '@/lib/degrees/validate';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const full_name = formData.get('full_name');
  const school_name = formData.get('school_name');
  const degree = formData.get('degree');
  const fieldRaw = formData.get('field');
  const graduation_year = formData.get('graduation_year');
  const file = formData.get('file');

  const err =
    validateDegreeText(full_name, 'Full name') ||
    validateDegreeText(school_name, 'School name') ||
    validateDegreeText(degree, 'Degree') ||
    (typeof fieldRaw === 'string' && fieldRaw.trim().length > 300 ? 'Field of study is too long.' : null);

  if (err) {
    return NextResponse.json({ error: err }, { status: 400 });
  }

  if (typeof graduation_year !== 'string') {
    return NextResponse.json({ error: 'Graduation year is required.' }, { status: 400 });
  }

  const yearParsed = parseGraduationYear(graduation_year);
  if (!yearParsed.ok) {
    return NextResponse.json({ error: yearParsed.error }, { status: 400 });
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Please upload a PDF or image.' }, { status: 400 });
  }

  if (!ALLOWED_DEGREE_MIME.includes(file.type as (typeof ALLOWED_DEGREE_MIME)[number])) {
    return NextResponse.json({ error: 'Only PDF, JPEG, PNG, or WebP files are allowed.' }, { status: 400 });
  }

  if (file.size > MAX_DEGREE_FILE_BYTES) {
    return NextResponse.json({ error: 'File must be 10MB or smaller.' }, { status: 400 });
  }

  const field =
    typeof fieldRaw === 'string' && fieldRaw.trim().length > 0 ? fieldRaw.trim().slice(0, 300) : null;

  const { data: existing, error: existingError } = await supabase
    .from('degrees')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) {
    console.error(existingError);
    return NextResponse.json({ error: 'Could not load existing submission.' }, { status: 500 });
  }

  if (existing?.status === 'pending') {
    return NextResponse.json(
      { error: 'You already have a verification in progress. Wait for admin review.' },
      { status: 409 }
    );
  }

  if (existing?.status === 'verified') {
    return NextResponse.json({ error: 'Your degree is already verified.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  let degreeId: string;

  if (existing?.status === 'rejected') {
    const { data: oldDocs } = await supabase.from('degree_documents').select('file_url').eq('degree_id', existing.id);
    const { error: delDocs } = await supabase.from('degree_documents').delete().eq('degree_id', existing.id);
    if (delDocs) {
      console.error(delDocs);
      return NextResponse.json({ error: 'Could not clear previous upload.' }, { status: 500 });
    }
    const oldPaths = (oldDocs ?? []).map((d) => d.file_url).filter(Boolean);
    if (oldPaths.length > 0) {
      await supabase.storage.from(DEGREE_DOC_BUCKET).remove(oldPaths);
    }

    const { data: updated, error: upErr } = await supabase
      .from('degrees')
      .update({
        full_name: (full_name as string).trim(),
        school_name: (school_name as string).trim(),
        degree: (degree as string).trim(),
        field,
        graduation_year: yearParsed.year,
        status: 'pending',
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: now,
      })
      .eq('id', existing.id)
      .eq('user_id', user.id)
      .select('id')
      .single();

    if (upErr || !updated) {
      console.error(upErr);
      return NextResponse.json({ error: 'Could not update submission.' }, { status: 500 });
    }
    degreeId = updated.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('degrees')
      .insert({
        user_id: user.id,
        full_name: (full_name as string).trim(),
        school_name: (school_name as string).trim(),
        degree: (degree as string).trim(),
        field,
        graduation_year: yearParsed.year,
        status: 'pending',
        updated_at: now,
      })
      .select('id')
      .single();

    if (insErr || !inserted) {
      console.error(insErr);
      return NextResponse.json({ error: 'Could not save submission.' }, { status: 500 });
    }
    degreeId = inserted.id;
  }

  const ext =
    file.type === 'application/pdf'
      ? 'pdf'
      : file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : 'jpg';

  const objectPath = `${user.id}/${degreeId}/document.${ext}`;

  const { error: uploadError } = await supabase.storage.from(DEGREE_DOC_BUCKET).upload(objectPath, file, {
    contentType: file.type,
    upsert: true,
  });

  if (uploadError) {
    console.error(uploadError);
    if (!existing) {
      await supabase.from('degrees').delete().eq('id', degreeId);
    }
    return NextResponse.json({ error: 'Upload failed. Try again.' }, { status: 500 });
  }

  const { error: docErr } = await supabase.from('degree_documents').insert({
    degree_id: degreeId,
    file_url: objectPath,
  });

  if (docErr) {
    console.error(docErr);
    await supabase.storage.from(DEGREE_DOC_BUCKET).remove([objectPath]);
    return NextResponse.json({ error: 'Could not save document record.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, degree_id: degreeId, status: 'pending' });
}
