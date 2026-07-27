// Resend a pending parent→child invite: refresh its expiry and re-deliver the
// email + in-app notification. Same token (the accept link stays valid).

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { deliverInvite } from '@/app/api/parent/invite-child/route';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { id } = await params;

    const { data: invite } = await admin
      .from('parent_child_invites')
      .select('id, parent_id, child_id, token, status')
      .eq('id', id)
      .maybeSingle();
    if (!invite || invite.parent_id !== parentProfile.id) {
      return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
    }
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'This invite is no longer pending.' }, { status: 409 });
    }

    await admin
      .from('parent_child_invites')
      .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', invite.id);

    await deliverInvite(admin, {
      origin: new URL(request.url).origin,
      token: invite.token,
      childId: invite.child_id,
      parentName: parentProfile.full_name || 'A parent/guardian',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ParentAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
