import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };
export const dynamic = 'force-dynamic';

// GET /api/groups/[groupId]/wa-redirect?token=<token>
// Validates the single-use token, logs the click, burns the token,
// then issues a 302 redirect to the real WhatsApp URL.
// The WhatsApp URL is only ever in the redirect header — never in the page.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const token = req.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    // Must be logged in
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    const service = getServiceClient();

    // Look up and validate the token
    const { data: tokenRow } = await service
      .from('wa_tokens')
      .select('id, user_id, group_id, expires_at, used')
      .eq('token', token)
      .maybeSingle();

    if (!tokenRow) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }
    if (tokenRow.used) {
      return NextResponse.json({ error: 'Token already used' }, { status: 403 });
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 403 });
    }
    if (tokenRow.group_id !== groupId || tokenRow.user_id !== user.id) {
      return NextResponse.json({ error: 'Token mismatch' }, { status: 403 });
    }

    // Fetch the real WhatsApp link
    const { data: group } = await service
      .from('groups')
      .select('whatsapp_link')
      .eq('id', groupId)
      .single();

    if (!group?.whatsapp_link) {
      return NextResponse.json({ error: 'No WhatsApp link configured' }, { status: 404 });
    }

    // Log the click and burn the token simultaneously
    await Promise.all([
      service.from('wa_clicks').insert({ user_id: user.id, group_id: groupId }),
      service.from('wa_tokens').update({ used: true }).eq('id', tokenRow.id),
    ]);

    // 302 redirect — WhatsApp URL only lives in this header
    return NextResponse.redirect(group.whatsapp_link);
  } catch (err) {
    console.error('[GET /api/groups/[groupId]/wa-redirect]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
