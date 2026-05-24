import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';
import { canReactToClassComment, canReactToTutorComment } from '@/lib/eligibility';
import { checkReactionRateLimit } from '@/lib/utils/commentRateLimits';

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
  if (!body?.reaction || !['like', 'dislike'].includes(body.reaction)) {
    return NextResponse.json({ error: 'reaction must be "like" or "dislike"' }, { status: 400 });
  }

  const withinLimit = await checkReactionRateLimit(userId);
  if (!withinLimit) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Eligibility
  let eligible: boolean;
  if (targetType === 'class_comment') {
    eligible = await canReactToClassComment(userId, targetId);
  } else {
    eligible = await canReactToTutorComment(userId, targetId);
  }
  if (!eligible) {
    return NextResponse.json({ error: 'Not eligible to react to this comment' }, { status: 403 });
  }

  const db = getServiceClient();

  // Fetch existing reaction
  const { data: existing } = await db
    .from('comment_reactions')
    .select('id, reaction_type')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    if (existing.reaction_type === body.reaction) {
      // Same reaction → remove (toggle off)
      await db.from('comment_reactions').delete().eq('id', existing.id);
      return NextResponse.json({ toggled: 'removed' });
    }
    // Opposite reaction → switch
    const { data, error } = await db
      .from('comment_reactions')
      .update({ reaction_type: body.reaction, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // New reaction
  const { data, error } = await db
    .from('comment_reactions')
    .insert({
      target_type: targetType,
      target_id: targetId,
      user_id: userId,
      reaction_type: body.reaction,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
