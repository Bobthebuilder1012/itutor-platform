import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';

const VALID_REASONS = ['spam', 'harassment', 'inappropriate_language', 'misleading', 'other'];

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
  if (!body?.reason || !VALID_REASONS.includes(body.reason)) {
    return NextResponse.json({ error: `reason must be one of: ${VALID_REASONS.join(', ')}` }, { status: 400 });
  }
  if (body.body && (typeof body.body !== 'string' || body.body.length > 500)) {
    return NextResponse.json({ error: 'body must be at most 500 characters' }, { status: 400 });
  }

  const db = getServiceClient();

  const { data, error } = await db
    .from('comment_reports')
    .insert({
      target_type: targetType,
      target_id: targetId,
      reply_id: body.replyId ?? null,
      reporter_id: userId,
      reason: body.reason,
      body: body.body ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
