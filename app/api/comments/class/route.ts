import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';
import { canCommentOnClass } from '@/lib/eligibility';
import { checkCommentRateLimit } from '@/lib/utils/commentRateLimits';
import { isProfane } from '@/lib/utils/profanity';

const LIMIT = 10;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('classId');
  const starFilter = searchParams.get('starFilter');
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);
  const limit = parseInt(searchParams.get('limit') ?? String(LIMIT), 10);

  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 });

  const db = getServiceClient();

  // Optionally get current user for reaction lookup
  let userId: string | null = null;
  try {
    const auth = await getAuthenticatedUserId();
    if (!auth.error) userId = auth.userId;
  } catch { /* unauthenticated — ok */ }

  let query = db
    .from('class_comments')
    .select('id, class_id, author_id, billing_period, body, stars, like_count, dislike_count, edited_at, hidden_at, deleted_at, created_at, author:profiles!class_comments_author_id_fkey(id, full_name, display_name, avatar_url)', { count: 'exact' })
    .eq('class_id', classId)
    .is('deleted_at', null)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (starFilter) {
    const stars = parseInt(starFilter, 10);
    if (stars >= 1 && stars <= 5) query = query.eq('stars', stars);
  }

  const { data: comments, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const commentIds = (comments ?? []).map((c: { id: string }) => c.id);

  // Fetch replies
  const { data: replies } = commentIds.length
    ? await db
        .from('comment_replies')
        .select('id, target_id, author_id, body, edited_at, deleted_at, created_at, author:profiles!comment_replies_author_id_fkey(id, full_name, display_name, avatar_url)')
        .eq('target_type', 'class_comment')
        .in('target_id', commentIds)
        .is('deleted_at', null)
    : { data: [] };

  // Fetch current user's reactions
  const { data: reactions } = userId && commentIds.length
    ? await db
        .from('comment_reactions')
        .select('target_id, reaction_type')
        .eq('target_type', 'class_comment')
        .in('target_id', commentIds)
        .eq('user_id', userId)
    : { data: [] };

  const repliesMap = new Map((replies ?? []).map((r: { target_id: string }) => [r.target_id, r]));
  const reactionsMap = new Map((reactions ?? []).map((r: { target_id: string; reaction_type: string }) => [r.target_id, r.reaction_type]));

  const enriched = (comments ?? []).map((c: { id: string }) => ({
    ...c,
    reply: repliesMap.get((c as { id: string }).id) ?? null,
    user_reaction: reactionsMap.get((c as { id: string }).id) ?? null,
  }));

  return NextResponse.json({ comments: enriched, total: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { classId, billingPeriod, body: commentBody, stars } = body;

  if (!classId || !billingPeriod || !commentBody) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (typeof commentBody !== 'string' || commentBody.length < 1 || commentBody.length > 1000) {
    return NextResponse.json({ error: 'body must be 1–1000 characters' }, { status: 400 });
  }
  if (stars !== undefined && stars !== null) {
    if (typeof stars !== 'number' || stars < 1 || stars > 5) {
      return NextResponse.json({ error: 'stars must be between 1 and 5' }, { status: 400 });
    }
  }

  const withinLimit = await checkCommentRateLimit(userId);
  if (!withinLimit) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const eligible = await canCommentOnClass(userId, classId, billingPeriod);
  if (!eligible) {
    return NextResponse.json({ error: 'Not eligible to comment on this class period' }, { status: 403 });
  }

  const db = getServiceClient();

  const { data: comment, error } = await db
    .from('class_comments')
    .insert({
      class_id: classId,
      author_id: userId,
      billing_period: billingPeriod,
      body: commentBody,
      stars: stars ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isProfane(commentBody)) {
    await db.from('comment_reports').insert({
      target_type: 'class_comment',
      target_id: comment.id,
      reporter_id: userId,
      reason: 'inappropriate_language',
      body: 'Auto-flagged at submit time.',
      status: 'pending',
    });
  }

  return NextResponse.json(comment, { status: 201 });
}
