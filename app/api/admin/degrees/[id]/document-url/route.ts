import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createRouteHandlerSupabase } from '@/lib/api/supabaseRouteClient';
import { DEGREE_DOC_BUCKET } from '@/lib/degrees/constants';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server not configured for signed URLs' }, { status: 500 });
  }

  const id = params.id;
  const supabase = createRouteHandlerSupabase();

  const { data: degree, error } = await supabase
    .from('degrees')
    .select('id, degree_documents ( file_url )')
    .eq('id', id)
    .single();

  if (error || !degree) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const docs = degree.degree_documents as { file_url: string }[] | null;
  const path = docs?.[0]?.file_url;
  if (!path) {
    return NextResponse.json({ error: 'No document' }, { status: 404 });
  }

  const admin = getServiceClient();
  const { data: signed, error: signErr } = await admin.storage
    .from(DEGREE_DOC_BUCKET)
    .createSignedUrl(path, 600);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not create link' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
