// Student accepts or declines a parent invite. Only the invited student may
// respond. On accept: set the child's billing_mode + create the parent_child_link
// (the ONLY place a link is now created), then notify the parent. On decline:
// mark declined + notify the parent. This is the consent gate that replaces the
// old instant linking.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const action = ((await request.json().catch(() => ({}))) as { action?: string }).action;
  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  const server = await getServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 });

  const admin = getServiceClient();
  const { data: invite } = await admin
    .from('parent_child_invites')
    .select('id, parent_id, child_id, status, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite || invite.child_id !== user.id) {
    return NextResponse.json({ error: 'This invite isn’t for your account.' }, { status: 403 });
  }
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'This invite has already been responded to or expired.' }, { status: 409 });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await admin.from('parent_child_invites').update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'This invite has expired. Ask your parent to send a new one.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data: child } = await admin.from('profiles').select('full_name, display_name').eq('id', invite.child_id).maybeSingle();
  const childName = child?.display_name || child?.full_name || 'Your child';

  if (action === 'accept') {
    // Set billing mode first, then create the link (write-order preserved from
    // the old link-child flow). Guard against a pre-existing link.
    await admin.from('profiles').update({ billing_mode: 'parent_required', updated_at: now }).eq('id', invite.child_id);
    const { data: existing } = await admin
      .from('parent_child_links').select('id').eq('parent_id', invite.parent_id).eq('child_id', invite.child_id).maybeSingle();
    if (!existing) {
      await admin.from('parent_child_links').insert({ parent_id: invite.parent_id, child_id: invite.child_id });
    }
    await admin.from('parent_child_invites').update({ status: 'accepted', responded_at: now }).eq('id', invite.id);
    await admin.from('notifications').insert({
      user_id: invite.parent_id,
      type: 'parent_link_accepted',
      title: 'Connection accepted',
      message: `${childName} accepted your request to connect as their parent/guardian.`,
      link: '/parent/children',
    }).then(undefined, () => {});
    return NextResponse.json({ success: true, action: 'accept' });
  }

  // decline
  await admin.from('parent_child_invites').update({ status: 'declined', responded_at: now }).eq('id', invite.id);
  await admin.from('notifications').insert({
    user_id: invite.parent_id,
    type: 'parent_link_declined',
    title: 'Connection declined',
    message: `${childName} declined your request to connect as their parent/guardian.`,
    link: '/parent/children',
  }).then(undefined, () => {});
  return NextResponse.json({ success: true, action: 'decline' });
}
