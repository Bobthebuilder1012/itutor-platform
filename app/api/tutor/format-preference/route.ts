import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api/authHelpers';
import { getServiceClient } from '@/lib/supabase/server';

const VALID_PREFERENCES = ['both', 'classes_only', 'one_on_one_only'];

export async function PATCH(req: NextRequest) {
  const auth = await getAuthenticatedUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  const body = await req.json().catch(() => null);
  if (!body?.tutor_format_preference || !VALID_PREFERENCES.includes(body.tutor_format_preference)) {
    return NextResponse.json(
      { error: `tutor_format_preference must be one of: ${VALID_PREFERENCES.join(', ')}` },
      { status: 400 }
    );
  }

  const db = getServiceClient();

  // Verify user is a tutor
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (!profile || profile.role !== 'tutor') {
    return NextResponse.json({ error: 'Only tutors can set format preference' }, { status: 403 });
  }

  const { data, error } = await db
    .from('profiles')
    .update({ tutor_format_preference: body.tutor_format_preference })
    .eq('id', userId)
    .select('id, tutor_format_preference')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
