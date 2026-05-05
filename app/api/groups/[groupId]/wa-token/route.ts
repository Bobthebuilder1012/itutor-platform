import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };
export const dynamic = 'force-dynamic';

// POST /api/groups/[groupId]/wa-token
// Generates a single-use 10-minute redirect token for approved members.
// The real WhatsApp URL never leaves the server.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;

    // 1. Must be logged in
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // 2. Group must exist and have a WhatsApp link configured
    const { data: group } = await service
      .from('groups')
      .select('id, tutor_id, whatsapp_link')
      .eq('id', groupId)
      .is('archived_at', null)
      .single();

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (!group.whatsapp_link) {
      return NextResponse.json({ error: 'No WhatsApp link configured' }, { status: 404 });
    }

    // 3. Must be the tutor or an approved member
    const isTutor = group.tutor_id === user.id;
    if (!isTutor) {
      const { data: membership } = await service
        .from('group_members')
        .select('status')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership || membership.status !== 'approved') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // 4. Generate a random single-use token (expires in 10 min)
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await service
      .from('wa_tokens')
      .insert({ token, user_id: user.id, group_id: groupId, expires_at: expiresAt, used: false });

    if (insertError) throw insertError;

    return NextResponse.json({
      redirectUrl: `/api/groups/${groupId}/wa-redirect?token=${token}`,
    });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/wa-token]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
