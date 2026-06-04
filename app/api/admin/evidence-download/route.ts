// GET /api/admin/evidence-download?path=...
// Generates a fresh signed download URL for a private evidence file.
// Redirects to the signed URL so the browser downloads/opens it.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const path = req.nextUrl.searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  // Generate a fresh signed URL (valid 5 minutes)
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.storage
    .from('noshow-evidence')
    .createSignedUrl(path, 300); // 5 minutes

  if (error || !data?.signedUrl) {
    console.error('[evidence-download] Failed to create signed URL:', error);
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
