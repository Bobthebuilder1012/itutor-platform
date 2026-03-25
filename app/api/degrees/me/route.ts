import { NextResponse } from 'next/server';
import { createRouteHandlerSupabase } from '@/lib/api/supabaseRouteClient';
import { DEGREE_DOC_BUCKET } from '@/lib/degrees/constants';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createRouteHandlerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: degree, error } = await supabase
    .from('degrees')
    .select(
      `
      id,
      full_name,
      school_name,
      degree,
      field,
      graduation_year,
      status,
      rejection_reason,
      reviewed_at,
      created_at,
      degree_documents ( id, file_url, uploaded_at )
    `
    )
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load degree record.' }, { status: 500 });
  }

  if (!degree) {
    return NextResponse.json({ degree: null });
  }

  let documentSignedUrl: string | null = null;
  const docs = degree.degree_documents as { file_url: string }[] | null;
  const path = docs?.[0]?.file_url;
  if (path && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = getServiceClient();
    const { data: signed } = await admin.storage
      .from(DEGREE_DOC_BUCKET)
      .createSignedUrl(path, 300);
    documentSignedUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    degree: {
      ...degree,
      documentSignedUrl,
    },
  });
}
