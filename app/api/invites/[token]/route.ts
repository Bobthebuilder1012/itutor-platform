// Fetch a parent invite for the accept page. Only the invited student (matching
// child_id) may read it; anyone else gets a generic "not for your account" so we
// don't leak whether a token is valid. Lazily marks past-expiry invites expired.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const server = await getServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please log in to view this invite.' }, { status: 401 });

  const admin = getServiceClient();
  const { data: invite } = await admin
    .from('parent_child_invites')
    .select('id, parent_id, child_id, child_email, status, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite || invite.child_id !== user.id) {
    return NextResponse.json({ error: 'This invite isn’t for your account.' }, { status: 403 });
  }

  let status = invite.status;
  if (status === 'pending' && new Date(invite.expires_at).getTime() < Date.now()) {
    await admin.from('parent_child_invites').update({ status: 'expired' }).eq('id', invite.id);
    status = 'expired';
  }

  const { data: parent } = await admin
    .from('profiles').select('full_name, display_name, avatar_url').eq('id', invite.parent_id).maybeSingle();
  const parentName = parent?.display_name || parent?.full_name || 'A parent/guardian';

  return NextResponse.json({
    status,
    parentName,
    parentAvatar: parent?.avatar_url ?? null,
    childEmail: invite.child_email,
    expiresAt: invite.expires_at,
  });
}
