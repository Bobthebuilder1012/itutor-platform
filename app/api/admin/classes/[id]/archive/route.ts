// POST /api/admin/classes/[id]/archive — reversible archive by any admin.
// Sets the canonical archived_at flag (honored by marketplace/listing queries)
// plus status='ARCHIVED'. Reverse with .../unarchive.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { id } = params;
  const body = await request.json().catch(() => ({}));
  const reason: string | null = typeof body?.reason === 'string' ? body.reason.trim() || null : null;

  const admin = getServiceClient();

  const { data: cls, error: findError } = await admin
    .from('groups')
    .select('id, name, tutor_id, archived_at')
    .eq('id', id)
    .single();
  if (findError || !cls) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  }
  if (cls.archived_at) {
    return NextResponse.json({ error: 'Class is already archived' }, { status: 409 });
  }

  const { error: updateError } = await admin
    .from('groups')
    .update({
      archived_at: new Date().toISOString(),
      status: 'ARCHIVED',
      archived_reason: reason,
    })
    .eq('id', id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await logAdminAction(
    { id: auth.profile?.id, email: auth.profile?.email },
    {
      action: 'class.archive',
      targetType: 'class',
      targetId: id,
      targetLabel: cls.name || id,
      details: { tutor_id: cls.tutor_id },
      reason,
    }
  );

  return NextResponse.json({ ok: true });
}
