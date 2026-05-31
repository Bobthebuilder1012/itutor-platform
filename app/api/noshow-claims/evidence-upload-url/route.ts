// =====================================================
// SIGNED UPLOAD URL FOR NO-SHOW EVIDENCE
// =====================================================
// POST /api/noshow-claims/evidence-upload-url
// Body: { filename: string, contentType: string, size: number }
//
// Returns a signed upload token + final object path for the
// noshow-evidence private bucket. The caller PUTs the file to the
// returned URL, then includes the `path` in their /file or /respond
// request body so the server can serialise it onto the claim row.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per mockup

interface Body {
  filename?: string;
  contentType?: string;
  size?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;

    if (!body.filename || !body.contentType || typeof body.size !== 'number') {
      return NextResponse.json(
        { error: 'filename, contentType, and size are required' },
        { status: 400 }
      );
    }
    if (!ALLOWED_TYPES.includes(body.contentType)) {
      return NextResponse.json(
        { error: 'Only PNG, JPG, or WEBP screenshots are accepted' },
        { status: 400 }
      );
    }
    if (body.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File exceeds 5 MB' },
        { status: 400 }
      );
    }

    const serverClient = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectPath = `${user.id}/${Date.now()}-${safeName}`;

    const { data, error } = await admin.storage
      .from('noshow-evidence')
      .createSignedUploadUrl(objectPath);

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Failed to create upload URL' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      path: objectPath,
      signed_url: data.signedUrl,
      token: data.token,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create upload URL' },
      { status: 500 }
    );
  }
}
