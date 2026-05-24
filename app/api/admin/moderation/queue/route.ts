import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId, requireAdmin } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const isAdmin = await requireAdmin(userId);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status') ?? 'pending';
  const search = searchParams.get('search') ?? '';

  const db = getServiceClient();

  let query = db
    .from('comment_reports')
    .select(`
      id, target_type, target_id, reply_id, reason, body, status,
      created_at, resolved_at, resolution_note,
      reporter:reporter_id(id, full_name, display_name),
      resolved_by_profile:resolved_by(id, full_name, display_name)
    `)
    .order('created_at', { ascending: false });

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data: reports, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with comment body previews
  const classCommentIds = (reports ?? [])
    .filter((r: { target_type: string; reply_id: string | null }) => r.target_type === 'class_comment' && !r.reply_id)
    .map((r: { target_id: string }) => r.target_id);
  const tutorCommentIds = (reports ?? [])
    .filter((r: { target_type: string; reply_id: string | null }) => r.target_type === 'tutor_profile_comment' && !r.reply_id)
    .map((r: { target_id: string }) => r.target_id);

  const [classComments, tutorComments] = await Promise.all([
    classCommentIds.length
      ? db.from('class_comments').select('id, body, author_id, class_id, author:profiles!class_comments_author_id_fkey(full_name, display_name), group:groups!class_comments_class_id_fkey(name)').in('id', classCommentIds)
      : { data: [] },
    tutorCommentIds.length
      ? db.from('tutor_profile_comments').select('id, body, author_id, tutor_id, author:profiles!tutor_profile_comments_author_id_fkey(full_name, display_name), tutor:profiles!tutor_profile_comments_tutor_id_fkey(full_name, display_name)').in('id', tutorCommentIds)
      : { data: [] },
  ]);

  const contentMap = new Map<string, { body: string; author: { full_name: string; display_name: string | null } | null; target_label: string }>();
  for (const c of (classComments.data ?? []) as Array<{ id: string; body: string; author: { full_name: string; display_name: string | null } | null; group: { name: string } | null }>) {
    contentMap.set(c.id, { body: c.body, author: c.author, target_label: c.group?.name ?? 'Class' });
  }
  for (const c of (tutorComments.data ?? []) as Array<{ id: string; body: string; author: { full_name: string; display_name: string | null } | null; tutor: { full_name: string; display_name: string | null } | null }>) {
    contentMap.set(c.id, { body: c.body, author: c.author, target_label: `Tutor profile: ${c.tutor?.display_name ?? c.tutor?.full_name ?? 'Unknown'}` });
  }

  const enriched = (reports ?? []).map((r: { target_id: string; body: string | null }) => {
    const content = contentMap.get(r.target_id);
    return {
      ...r,
      comment_preview: search
        ? (content?.body ?? '').toLowerCase().includes(search.toLowerCase()) ? content : null
        : content,
      comment_author: content?.author ?? null,
      target_label: content?.target_label ?? r.target_type,
    };
  }).filter((r: { comment_preview: null | object }) => !search || r.comment_preview !== null);

  // Count pending for badge
  const { count: pendingCount } = await db
    .from('comment_reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  return NextResponse.json({ reports: enriched, pendingCount: pendingCount ?? 0 });
}
