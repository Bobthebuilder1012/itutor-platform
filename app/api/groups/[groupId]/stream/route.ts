import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

async function ensureGroupAccess(groupId: string, userId: string) {
  const service = getServiceClient();
  const { data: group, error: groupErr } = await service
    .from('groups')
    .select('tutor_id')
    .eq('id', groupId)
    .maybeSingle();
  if (groupErr || !group) return { error: 'Group not found', status: 404 as const };
  const isTutor = group.tutor_id === userId;
  if (!isTutor) {
    const { data: membership } = await service
      .from('group_members')
      .select('status')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!membership || membership.status !== 'approved') {
      return { error: 'Forbidden', status: 403 as const };
    }
  }
  return { service, isTutor };
}

// GET /api/groups/[groupId]/stream — list stream posts with replies (paginated)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const access = await ensureGroupAccess(groupId, user.id);
    if ('status' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { service } = access;
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const limit = Math.min(50, Math.max(10, parseInt(url.searchParams.get('limit') ?? '20', 10)));
    const offset = (page - 1) * limit;

    let rawPosts: unknown[] | null = null;

    // Try full select including assignment columns
    const fullPostsResult = await service
      .from('stream_posts')
      .select('id, group_id, author_id, author_role, post_type, message_body, marks_available, due_date, pinned_at, pin_expires_at, created_at, updated_at')
      .eq('group_id', groupId)
      .order('pinned_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (fullPostsResult.error?.code === 'PGRST204' || fullPostsResult.error?.message?.includes('marks_available') || fullPostsResult.error?.message?.includes('due_date') || fullPostsResult.error?.message?.includes('pinned_at')) {
      // Migration not yet fully run — fall back to minimal base columns only
      console.warn('[GET /api/groups/[groupId]/stream] extended columns missing, using minimal fallback select');
      const fallbackResult = await service
        .from('stream_posts')
        .select('id, group_id, author_id, author_role, post_type, message_body, created_at, updated_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (fallbackResult.error) {
        console.warn('[GET /api/groups/[groupId]/stream] fallback posts query failed:', fallbackResult.error.message);
        return NextResponse.json({ posts: [], pagination: { page, limit, has_more: false } });
      }
      rawPosts = fallbackResult.data;
    } else if (fullPostsResult.error) {
      console.warn('[GET /api/groups/[groupId]/stream] posts query failed, returning empty feed:', fullPostsResult.error.message);
      return NextResponse.json({ posts: [], pagination: { page, limit, has_more: false } });
    } else {
      rawPosts = fullPostsResult.data;
    }

    const now = new Date().toISOString();
    const posts = (rawPosts ?? []).map((p: any) => {
      if (p.pinned_at && p.pin_expires_at && p.pin_expires_at < now) {
        return { ...p, pinned_at: null, pin_expires_at: null };
      }
      return p;
    });

    const postIds = (posts ?? []).map((p: { id: string }) => p.id);
    if (postIds.length === 0) {
      return NextResponse.json({
        posts: [],
        pagination: { page, limit, has_more: false },
      });
    }

    const [repliesRes, attachmentsRes, authorIds] = await Promise.all([
      service.from('stream_replies').select('id, post_id, author_id, message_body, parent_reply_id, created_at, updated_at').in('post_id', postIds).order('created_at', { ascending: true }),
      service.from('stream_attachments').select('id, post_id, file_name, file_url, file_type, file_size_bytes, created_at').in('post_id', postIds),
      Promise.resolve([...new Set((posts ?? []).map((p: { author_id: string }) => p.author_id))] as string[]),
    ]);

    const replyIds = (repliesRes.data ?? []).map((r: { id: string }) => r.id);
    const replyAuthorIds = [...new Set((repliesRes.data ?? []).map((r: { author_id: string }) => r.author_id))];
    const allAuthorIds = [...new Set([...authorIds, ...replyAuthorIds])];

    let profiles: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
    if (allAuthorIds.length > 0) {
      const profRes = await service
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', allAuthorIds);
      if (profRes.error) {
        console.warn('[GET /api/groups/[groupId]/stream] profiles lookup failed:', profRes.error.message);
      } else {
        profiles = (profRes.data ?? []) as typeof profiles;
      }
    }

    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const attachmentsByPost = new Map<string, unknown[]>();
    (attachmentsRes.data ?? []).forEach((a: unknown) => {
      const row = a as { post_id: string };
      const list = attachmentsByPost.get(row.post_id) ?? [];
      list.push(a);
      attachmentsByPost.set(row.post_id, list);
    });

    type ReplyRow = { id: string; post_id: string; author_id: string; message_body: string; parent_reply_id: string | null; created_at: string; updated_at: string };
    const repliesByPost = new Map<string, ReplyRow[]>();
    (repliesRes.data ?? []).forEach((r: ReplyRow) => {
      const list = repliesByPost.get(r.post_id) ?? [];
      list.push(r);
      repliesByPost.set(r.post_id, list);
    });

    function nestReplies(flat: ReplyRow[]): { id: string; author_id: string; message_body: string; parent_reply_id: string | null; created_at: string; updated_at: string; author: unknown; replies: unknown[] }[] {
      const byId = new Map(flat.map((r) => [r.id, { ...r, author: profileMap.get(r.author_id), replies: [] as unknown[] }]));
      const roots: unknown[] = [];
      flat.forEach((r) => {
        const node = byId.get(r.id)!;
        if (!r.parent_reply_id) {
          roots.push(node);
        } else {
          const parent = byId.get(r.parent_reply_id);
          if (parent) parent.replies = parent.replies || [];
          (parent?.replies ?? []).push(node);
        }
      });
      roots.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return roots as { id: string; author_id: string; message_body: string; parent_reply_id: string | null; created_at: string; updated_at: string; author: unknown; replies: unknown[] }[];
    }

    const postsWithMeta = (posts ?? []).map((p: any) => ({
      ...p,
      author: profileMap.get(p.author_id) ?? { id: p.author_id, full_name: 'Unknown', avatar_url: null },
      attachments: attachmentsByPost.get(p.id) ?? [],
      replies: nestReplies(repliesByPost.get(p.id) ?? []),
    }));

    const hasMore = (posts ?? []).length === limit;

    return NextResponse.json({
      posts: postsWithMeta,
      pagination: { page, limit, has_more: hasMore },
    });
  } catch (err) {
    console.error('[GET /api/groups/[groupId]/stream]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
