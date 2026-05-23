import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';
import { canReplyToComment } from '@/lib/eligibility';
import { isProfane } from '@/lib/utils/profanity';

type Params = { targetType: string; targetId: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Params }
) {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const { targetType, targetId } = params;
  if (targetType !== 'class_comment' && targetType !== 'tutor_profile_comment') {
    return NextResponse.json({ error: 'Invalid targetType' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.body) return NextResponse.json({ error: 'body is required' }, { status: 400 });
  if (typeof body.body !== 'string' || body.body.length < 1 || body.body.length > 1000) {
    return NextResponse.json({ error: 'body must be 1–1000 characters' }, { status: 400 });
  }

  const eligible = await canReplyToComment(
    userId,
    targetType as 'class_comment' | 'tutor_profile_comment',
    targetId
  );
  if (!eligible) {
    return NextResponse.json({ error: 'Only the tutor may reply to this comment' }, { status: 403 });
  }

  const db = getServiceClient();

  const { data: reply, error } = await db
    .from('comment_replies')
    .insert({
      target_type: targetType,
      target_id: targetId,
      author_id: userId,
      body: body.body,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A reply already exists for this comment' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (isProfane(body.body)) {
    await db.from('comment_reports').insert({
      target_type: targetType,
      target_id: targetId,
      reply_id: reply.id,
      reporter_id: userId,
      reason: 'inappropriate_language',
      body: 'Auto-flagged at submit time.',
      status: 'pending',
    });
  }

  return NextResponse.json(reply, { status: 201 });
}
