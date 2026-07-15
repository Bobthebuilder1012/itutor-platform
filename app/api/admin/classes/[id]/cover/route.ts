// POST /api/admin/classes/[id]/cover — admin sets a class banner (cover image)
// on the tutor's behalf. Uploads to the `class-banners` bucket the tutor flow
// uses, then writes groups.cover_image and audits.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET = 'class-banners';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { id } = params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
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

  const { data: cls, error: findError } = await admin
    .from('groups')
    .select('id, name, tutor_id')
    .eq('id', id)
    .single();
  if (findError || !cls) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `class-banners/${id}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) {
    console.error('Admin class cover upload failed:', uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { error: updateError } = await admin
    .from('groups')
    .update({ cover_image: publicUrl })
    .eq('id', id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await logAdminAction(
    { id: auth.profile?.id, email: auth.profile?.email },
    {
      action: 'class.cover_set',
      targetType: 'class',
      targetId: id,
      targetLabel: cls.name || id,
      details: { tutor_id: cls.tutor_id, path },
    }
  );

  return NextResponse.json({ url: publicUrl });
}
