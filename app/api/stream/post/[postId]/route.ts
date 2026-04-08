import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ postId: string }> };

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { postId } = await params;
    const service = getServiceClient();

    const { data: post, error: fetchError } = await service
      .from('stream_posts')
      .select('id, group_id')
      .eq('id', postId)
      .single();

    if (fetchError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', post.group_id).single();
    if (group?.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Only the tutor can pin posts' }, { status: 403 });
    }

    const { pinned } = await req.json();
    const { error: updateError } = await service
      .from('stream_posts')
      .update({ pinned_at: pinned ? new Date().toISOString() : null })
      .eq('id', postId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/stream/post/[postId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { postId } = await params;
    const service = getServiceClient();

    const { data: post, error: fetchError } = await service
      .from('stream_posts')
      .select('id, author_id, group_id')
      .eq('id', postId)
      .single();

    if (fetchError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', post.group_id).single();
    const isTutorOwner = group?.tutor_id === user.id;
    const isAuthor = post.author_id === user.id;

    if (!isTutorOwner && !isAuthor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error: deleteError } = await service.from('stream_posts').delete().eq('id', postId);

    if (deleteError) throw deleteError;

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[DELETE /api/stream/post/[postId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
