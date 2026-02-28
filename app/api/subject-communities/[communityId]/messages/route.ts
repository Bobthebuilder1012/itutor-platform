import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import {
  getSubjectCommunityMessages,
  postSubjectCommunityMessage,
  getSubjectCommunityMembership,
} from '@/lib/subject-communities';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> }
) {
  try {
    const { communityId } = await params;
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });

    const membership = await getSubjectCommunityMembership(supabase, user.id, communityId);
    if (!membership) return NextResponse.json({ ok: false, error: 'Not a member' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(10, parseInt(searchParams.get('limit') || '30', 10)));
    const before = searchParams.get('before') || undefined;

    const messages = await getSubjectCommunityMessages(supabase, communityId, { limit, before });
    return NextResponse.json({ ok: true, messages });
  } catch (e) {
    console.error('[subject-communities/messages GET]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> }
) {
  try {
    const { communityId } = await params;
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });

    const membership = await getSubjectCommunityMembership(supabase, user.id, communityId);
    if (!membership) return NextResponse.json({ ok: false, error: 'Not a member' }, { status: 403 });

    const body = await request.json();
    const messageText = body?.messageText ?? body?.message_text ?? body?.content ?? '';
    if (!messageText.trim()) return NextResponse.json({ ok: false, error: 'Message required' }, { status: 400 });

    const result = await postSubjectCommunityMessage(supabase, user.id, communityId, messageText.trim());
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (e) {
    console.error('[subject-communities/messages POST]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
