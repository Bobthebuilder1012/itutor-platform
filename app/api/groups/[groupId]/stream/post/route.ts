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

    const basePayload = {
      group_id: groupId,
      author_id: user.id,
      author_role: authorRole,
      post_type: postType,
      message_body: messageBody,
    };

    const BASE_SELECT = 'id, group_id, author_id, author_role, post_type, message_body, created_at, updated_at';
    const FULL_SELECT = 'id, group_id, author_id, author_role, post_type, message_body, marks_available, due_date, created_at, updated_at';

    // Only assignment posts use the marks_available/due_date columns. Selecting
    // those columns when the assignment migration hasn't run errors — and the
    // error code is 42703 ("column does not exist") for the SELECT, or PGRST204
    // for the INSERT payload — so non-assignment posts must NOT select them at
    // all (otherwise every announcement/content/link post 500s), and the
    // assignment path falls back to base columns when they're missing.
    let result;
    if (postType === 'assignment') {
      result = await service
        .from('stream_posts')
        .insert({ ...basePayload, marks_available: body.marks_available ?? null, due_date: body.due_date ?? null })
        .select(FULL_SELECT)
        .single();
      const missingCols = !!result.error && (
        result.error.code === 'PGRST204' ||
        result.error.code === '42703' ||
        /marks_available|due_date/.test(result.error.message ?? '')
      );
      if (missingCols) {
        result = await service.from('stream_posts').insert(basePayload).select(BASE_SELECT).single();
      }
    } else {
      result = await service.from('stream_posts').insert(basePayload).select(BASE_SELECT).single();
    }

    if (result.error) throw result.error;
    const post = result.data as Record<string, unknown>;

    const attachmentUrls = body.attachment_urls ?? [];
    if (attachmentUrls.length > 0) {
      const { error: attachErr } = await service.from('stream_attachments').insert(
        attachmentUrls.map((a) => ({
          post_id: post.id,
          file_name: a.file_name,
          file_url: a.file_url,
          file_type: a.file_type ?? null,
          file_size_bytes: a.file_size_bytes ?? null,
        }))
      );
      // Non-blocking: the post is already created; surface attachment failures
      // in logs rather than 500-ing and orphaning the post.
      if (attachErr) console.error('[POST stream/post] attachment insert failed', attachErr);
    }

    const { data: author } = await service.from('profiles').select('id, full_name, avatar_url').eq('id', user.id).single();
    const { data: attachments } = await service
      .from('stream_attachments')
      .select('id, post_id, file_name, file_url, file_type, file_size_bytes, created_at')
      .eq('post_id', post.id);

    // Notify approved members (not the author)
    try {
      const { data: members } = await service
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('status', 'approved')
        .neq('user_id', user.id);

      if ((members?.length ?? 0) > 0) {
        const { data: groupRow } = await service.from('groups').select('name').eq('id', groupId).single();
        const groupName = (groupRow as { name?: string } | null)?.name ?? 'your class';
        const authorName = author?.full_name ?? 'A user';
        const typeLabel =
          postType === 'announcement' ? '📢 Announcement' :
          postType === 'assignment' ? '📝 Assignment' :
          postType === 'content' ? '📄 New Content' : '💬 Discussion';
        const preview = messageBody.length > 80 ? `${messageBody.slice(0, 77)}…` : messageBody;
        const rows = (members as Array<{ user_id: string }>).map((m) => ({
          user_id: m.user_id,
          type: 'new_stream_post',
          title: typeLabel,
          message: `${authorName} in ${groupName}: ${preview}`,
          link: `/lessons/${groupId}`,
          group_id: groupId,
          metadata: { postId: post.id, postType },
        }));
        await service.from('notifications').insert(rows);
      }
    } catch (err) {
      console.error('[POST stream/post] notify failed', err);
    }

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
