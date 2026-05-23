import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';
import { canCommentOnTutor } from '@/lib/eligibility';
import { checkCommentRateLimit } from '@/lib/utils/commentRateLimits';
import { isProfane } from '@/lib/utils/profanity';

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { tutorId, sessionId, body: commentBody, stars } = body;

  if (!tutorId || !sessionId || !commentBody) {
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

  const eligible = await canCommentOnTutor(userId, tutorId, sessionId);
  if (!eligible) {
    return NextResponse.json({ error: 'Not eligible to comment on this tutor' }, { status: 403 });
  }

  const db = getServiceClient();

  const { data: comment, error } = await db
    .from('tutor_profile_comments')
    .insert({
      tutor_id: tutorId,
      author_id: userId,
      session_id: sessionId,
      body: commentBody,
      stars: stars ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isProfane(commentBody)) {
    await db.from('comment_reports').insert({
      target_type: 'tutor_profile_comment',
      target_id: comment.id,
      reporter_id: userId,
      reason: 'inappropriate_language',
      body: 'Auto-flagged at submit time.',
      status: 'pending',
    });
  }

  return NextResponse.json(comment, { status: 201 });
}
