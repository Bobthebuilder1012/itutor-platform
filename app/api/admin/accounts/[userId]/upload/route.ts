// POST /api/admin/accounts/[userId]/upload — admin sets a tutor's avatar or
// profile banner on their behalf. Uploads to the same `avatars` bucket the
// tutor flows use, via the service client (bypasses owner-only storage RLS),
// then writes the URL to profiles and audits the action.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET = 'avatars';

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { userId } = params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const kind = String(form.get('kind') || '');
  const file = form.get('file');

  if (kind !== 'avatar' && kind !== 'banner') {
    return NextResponse.json({ error: "kind must be 'avatar' or 'banner'" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'file must be an image' }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'file must be under 8MB' }, { status: 400 });
  }

  const admin = getServiceClient();

  const { data: before, error: beforeError } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', userId)
    .single();
  if (beforeError || !before) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const path = kind === 'avatar' ? `${userId}/avatar.jpg` : `${userId}/profile-banner.jpg`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) {
    console.error('Admin upload failed:', uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  // The storage path is stable (${userId}/avatar.jpg), so re-uploads keep the
  // same public URL and the browser/CDN serves the stale cached image. Bake a
  // cache-busting timestamp into the STORED url — matching lib/hooks/useAvatarUpload.ts
  // — so every future read of the column is fresh everywhere, not just this response.
  const storedUrl = `${pub.publicUrl}?t=${Date.now()}`;
  const column = kind === 'avatar' ? 'avatar_url' : 'profile_banner_url';

  const { error: updateError } = await admin
    .from('profiles')
    .update({ [column]: storedUrl, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await logAdminAction(
    { id: auth.profile?.id, email: auth.profile?.email },
    {
      action: kind === 'avatar' ? 'account.avatar_set' : 'account.banner_set',
      targetType: 'account',
      targetId: userId,
      targetLabel: before.email || before.full_name || userId,
      details: { kind, path },
    }
  );

  // The stored URL is already cache-busted, so it's safe to display directly.
  return NextResponse.json({ url: storedUrl, displayUrl: storedUrl });
}
