import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { CreateStreamPostInput, StreamPostType } from '@/lib/types/groupStream';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const service = getServiceClient();

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const isTutor = group.tutor_id === user.id;
    if (!isTutor) {
      const { data: membership } = await service
        .from('group_members')
        .select('status')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();
      if (!membership || membership.status !== 'approved') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = (await req.json()) as CreateStreamPostInput;
    const postType = (body.post_type ?? 'discussion') as StreamPostType;
    const messageBody = body.message_body?.trim();
    if (!messageBody) {
      return NextResponse.json({ error: 'message_body is required' }, { status: 400 });
    }

    if (isTutor) {
      if (!['announcement', 'content', 'discussion', 'assignment'].includes(postType)) {
        return NextResponse.json({ error: 'Invalid post_type' }, { status: 400 });
      }
    } else {
      if (postType !== 'discussion') {
        return NextResponse.json({ error: 'Students can only create discussion posts' }, { status: 403 });
      }
    }

    const authorRole = isTutor ? 'tutor' : 'student';

    // Try inserting with assignment columns; fall back to base columns if migration not run.
    const basePayload = {
      group_id: groupId,
      author_id: user.id,
      author_role: authorRole,
      post_type: postType,
      message_body: messageBody,
    };

    const fullPayload = postType === 'assignment'
      ? { ...basePayload, marks_available: body.marks_available ?? null, due_date: body.due_date ?? null }
      : basePayload;

    // First attempt: full payload + full select
    let result = await service
      .from('stream_posts')
      .insert(fullPayload)
      .select('id, group_id, author_id, author_role, post_type, message_body, marks_available, due_date, created_at, updated_at')
      .single();

    if (result.error?.code === 'PGRST204') {
      // Assignment columns not yet in DB (migration pending) — insert base-only payload
      result = await service
        .from('stream_posts')
        .insert(basePayload)
        .select('id, group_id, author_id, author_role, post_type, message_body, created_at, updated_at')
        .single();
    }

    if (result.error) throw result.error;
    const post = result.data as Record<string, unknown>;

    const attachmentUrls = body.attachment_urls ?? [];
    if (attachmentUrls.length > 0) {
      await service.from('stream_attachments').insert(
        attachmentUrls.map((a) => ({
          post_id: post.id,
          file_name: a.file_name,
          file_url: a.file_url,
          file_type: a.file_type ?? null,
          file_size_bytes: a.file_size_bytes ?? null,
        }))
      );
    }

    const { data: author } = await service.from('profiles').select('id, full_name, avatar_url').eq('id', user.id).single();
    const { data: attachments } = await service
      .from('stream_attachments')
      .select('id, post_id, file_name, file_url, file_type, file_size_bytes, created_at')
      .eq('post_id', post.id);

    return NextResponse.json(
      {
        post: {
          ...post,
          author: author ?? { id: user.id, full_name: 'Unknown', avatar_url: null },
          attachments: attachments ?? [],
          replies: [],
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/stream/post]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
