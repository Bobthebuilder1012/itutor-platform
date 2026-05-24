import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';
import type { EligibilityResponse } from '@/lib/types/comments';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetType = searchParams.get('targetType');
  const targetId = searchParams.get('targetId');

  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'targetType and targetId required' }, { status: 400 });
  }
  if (targetType !== 'class' && targetType !== 'tutor_profile') {
    return NextResponse.json({ error: 'Invalid targetType' }, { status: 400 });
  }

  // Default response for unauthenticated users
  let userId: string | null = null;
  try {
    const auth = await getAuthenticatedUserId();
    if (!auth.error) userId = auth.userId;
  } catch { /* unauthenticated */ }

  if (!userId) {
    const res: EligibilityResponse = {
      canComment: false,
      canReact: false,
      hasExistingComment: false,
    };
    return NextResponse.json(res);
  }

  const db = getServiceClient();

  if (targetType === 'class') {
    const classId = targetId;

    // Find pending rating prompts for this user+class — those define available billing periods
    const { data: prompts } = await db
      .from('rating_prompts')
      .select('billing_period, status')
      .eq('student_id', userId)
      .eq('class_id', classId)
      .in('status', ['pending'])
      .order('created_at', { ascending: false })
      .limit(5);

    // Find existing comments by this user for this class
    const { data: existingComments } = await db
      .from('class_comments')
      .select('billing_period')
      .eq('class_id', classId)
      .eq('author_id', userId)
      .is('deleted_at', null);

    const commentedPeriods = new Set((existingComments ?? []).map((c: { billing_period: string }) => c.billing_period));

    // Available billing period: first pending prompt with no existing comment
    const availablePrompt = (prompts ?? []).find(
      (p: { billing_period: string }) => !commentedPeriods.has(p.billing_period)
    );

    const availableBillingPeriod = availablePrompt?.billing_period ?? undefined;
    const hasExistingComment = (existingComments ?? []).length > 0;

    // canReact: user is enrolled in this class
    const { count: enrollCount } = await db
      .from('group_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', classId)
      .eq('student_id', userId)
      .in('status', ['ACTIVE', 'COMPLETED']);

    const res: EligibilityResponse = {
      canComment: !!availableBillingPeriod,
      canReact: (enrollCount ?? 0) > 0,
      availableBillingPeriod,
      hasExistingComment,
    };
    return NextResponse.json(res);
  }

  // targetType === 'tutor_profile'
  const tutorId = targetId;

  // Find completed sessions with this tutor for current user that have no comment
  const { data: sessions } = await db
    .from('sessions')
    .select('id')
    .eq('student_id', userId)
    .eq('tutor_id', tutorId)
    .eq('status', 'COMPLETED');

  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);

  // Find which sessions already have a comment
  const { data: existingComments } = sessionIds.length
    ? await db
        .from('tutor_profile_comments')
        .select('session_id')
        .in('session_id', sessionIds)
        .is('deleted_at', null)
    : { data: [] };

  const commentedSessionIds = new Set((existingComments ?? []).map((c: { session_id: string }) => c.session_id));
  const availableSessionIds = sessionIds.filter((id: string) => !commentedSessionIds.has(id));

  const hasExistingComment = commentedSessionIds.size > 0;

  const res: EligibilityResponse = {
    canComment: availableSessionIds.length > 0,
    canReact: sessionIds.length > 0,
    availableSessionIds,
    hasExistingComment,
  };
  return NextResponse.json(res);
}
