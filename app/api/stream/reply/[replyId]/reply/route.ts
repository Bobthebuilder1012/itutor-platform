import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ replyId: string }> };

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { replyId } = await params;
    const service = getServiceClient();

    const { data: parentReply } = await service
      .from('stream_replies')
      .select('id, post_id')
      .eq('id', replyId)
      .single();

    if (!parentReply) return NextResponse.json({ error: 'Reply not found' }, { status: 404 });

    const { data: post } = await service
      .from('stream_posts')
      .select('group_id')
      .eq('id', parentReply.post_id)
      .single();

    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', post.group_id).single();
    const isTutor = group?.tutor_id === user.id;
    if (!isTutor) {
      const { data: membership } = await service
        .from('group_members')
        .select('status')
        .eq('group_id', post.group_id)
        .eq('user_id', user.id)
        .single();
      if (!membership || membership.status !== 'approved') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await req.json();
    const messageBody = body?.message_body?.trim();
    if (!messageBody) {
      return NextResponse.json({ error: 'message_body is required' }, { status: 400 });
    }

    const { data: reply, error: insertError } = await service
      .from('stream_replies')
      .insert({
        post_id: parentReply.post_id,
        author_id: user.id,
        message_body: messageBody,
        parent_reply_id: replyId,
      })
      .select('id, post_id, author_id, message_body, parent_reply_id, created_at, updated_at')
      .single();

    if (insertError) throw insertError;

    const { data: author } = await service.from('profiles').select('id, full_name, avatar_url').eq('id', user.id).single();

    return NextResponse.json(
      {
        reply: {
          ...reply,
          author: author ?? { id: user.id, full_name: 'Unknown', avatar_url: null },
          replies: [],
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/stream/reply/[replyId]/reply]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
