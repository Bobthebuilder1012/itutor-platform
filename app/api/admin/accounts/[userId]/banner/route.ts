// DELETE /api/admin/accounts/[userId]/banner — admin removes a tutor's default
// profile banner. Clears profiles.profile_banner_url (the render fallback chain
// then applies) and audits. Setting/replacing a banner is handled by the
// existing POST /api/admin/accounts/[userId]/upload (kind=banner).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { userId } = params;
  const admin = getServiceClient();

  const { data: before, error: findError } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', userId)
    .single();
  if (findError || !before) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { error } = await admin
    .from('profiles')
    .update({ profile_banner_url: null })
    .eq('id', userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAdminAction(
    { id: auth.profile?.id, email: auth.profile?.email },
    {
      action: 'account.banner_removed',
      targetType: 'account',
      targetId: userId,
      targetLabel: before.email || before.full_name || userId,
    }
  );

  return NextResponse.json({ success: true });
}
