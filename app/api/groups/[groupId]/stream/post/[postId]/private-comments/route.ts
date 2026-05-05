import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string; postId: string }> };

async function resolveUser(groupId: string) {
  const supabase = await getServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, group: null, isTutor: false };

  const service = getServiceClient();
  const { data: group } = await service
    .from('groups')
    .select('id, tutor_id')
    .eq('id', groupId)
    .single();

  return { user, group, isTutor: group?.tutor_id === user.id, service };
}

// GET /api/groups/[groupId]/stream/post/[postId]/private-comments
// Students get their own thread; tutors pass ?studentId= to get a specific student's thread.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { groupId, postId } = await params;
    const { user, group, isTutor, service } = await resolveUser(groupId);
    if (!user || !group) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const studentId = isTutor
      ? (req.nextUrl.searchParams.get('studentId') ?? null)
      : user.id;

    if (!studentId) return NextResponse.json({ comments: [] });

    const { data: comments, error } = await service!
      .from('post_private_comments')
      .select(`
        id, post_id, student_id, author_id, content, created_at,
        author:profiles!post_private_comments_author_id_fkey(id, full_name, avatar_url)
      `)
      .eq('post_id', postId)
      .eq('student_id', studentId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ comments: comments ?? [] });
  } catch (err) {
    console.error('[GET private-comments]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[groupId]/stream/post/[postId]/private-comments
// Body: { content: string, studentId?: string } (studentId only needed when tutor replies)
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { groupId, postId } = await params;
    const { user, group, isTutor, service } = await resolveUser(groupId);
    if (!user || !group) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const content = (body.content ?? '').trim();
    if (!content) return NextResponse.json({ error: 'Content is required' }, { status: 400 });

    const studentId = isTutor ? (body.studentId ?? null) : user.id;
    if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 });

    const { data: comment, error } = await service!
      .from('post_private_comments')
      .insert({ post_id: postId, student_id: studentId, author_id: user.id, content })
      .select(`
        id, post_id, student_id, author_id, content, created_at,
        author:profiles!post_private_comments_author_id_fkey(id, full_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error('[POST private-comments]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
