// POST /api/admin/classes/[id]/unarchive — reverse an archive by any admin.
// Clears archived_at and restores status='PUBLISHED' (marketplace visibility).

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
  const admin = getServiceClient();

  const { data: cls, error: findError } = await admin
    .from('groups')
    .select('id, name, tutor_id, archived_at')
    .eq('id', id)
    .single();
  if (findError || !cls) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  }
  if (!cls.archived_at) {
    return NextResponse.json({ error: 'Class is not archived' }, { status: 409 });
  }

  const { error: updateError } = await admin
    .from('groups')
    .update({ archived_at: null, status: 'PUBLISHED', archived_reason: null })
    .eq('id', id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await logAdminAction(
    { id: auth.profile?.id, email: auth.profile?.email },
    {
      action: 'class.unarchive',
      targetType: 'class',
      targetId: id,
      targetLabel: cls.name || id,
      details: { tutor_id: cls.tutor_id },
    }
  );

  return NextResponse.json({ ok: true });
}
