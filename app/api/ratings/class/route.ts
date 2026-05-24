import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';
import { canRateClass } from '@/lib/eligibility';

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { classId, billingPeriod, stars, comment } = body;

  if (!classId || !billingPeriod || typeof stars !== 'number') {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (stars < 1 || stars > 5) {
    return NextResponse.json({ error: 'stars must be between 1 and 5' }, { status: 400 });
  }

  const eligible = await canRateClass(userId, classId, billingPeriod);
  if (!eligible) {
    return NextResponse.json({ error: 'Not eligible to rate this class period' }, { status: 403 });
  }

  const db = getServiceClient();

  // Fetch tutor_id from groups
  const { data: group, error: groupError } = await db
    .from('groups')
    .select('tutor_id')
    .eq('id', classId)
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  }

  const { data: rating, error } = await db
    .from('class_ratings')
    .insert({
      class_id: classId,
      student_id: userId,
      tutor_id: group.tutor_id,
      billing_period: billingPeriod,
      stars,
      comment: comment ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mark the rating_prompt as submitted
  await db
    .from('rating_prompts')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('student_id', userId)
    .eq('class_id', classId)
    .eq('billing_period', billingPeriod)
    .eq('status', 'pending');

  return NextResponse.json(rating, { status: 201 });
}
