import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

/**
 * Determine the closed billing period string for a class.
 *
 * - per_month: previous calendar month, e.g. "2026-04"
 * - per_session / prepaid: returns null — per-session prompts are generated
 *   directly from completed sessions, not this monthly sweep.
 */
function getClosedMonthlyPeriod(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();

  // Fetch all active (non-archived) monthly-billed classes
  const { data: classes, error: classError } = await db
    .from('groups')
    .select('id, tutor_id, billing_model')
    .is('archived_at', null)
    .eq('billing_model', 'per_month');

  if (classError) {
    console.error('[generate-rating-prompts] fetch classes:', classError.message);
    return NextResponse.json({ error: classError.message }, { status: 500 });
  }

  const billingPeriod = getClosedMonthlyPeriod();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  let created = 0;

  for (const cls of classes ?? []) {
    // Fetch active enrolled students for this class
    const { data: enrollments } = await db
      .from('group_members')
      .select('user_id')
      .eq('group_id', cls.id)
      .eq('status', 'active');

    for (const enrollment of enrollments ?? []) {
      const studentId = enrollment.user_id;

      // Skip if prompt already exists
      const { count } = await db
        .from('rating_prompts')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .eq('class_id', cls.id)
        .eq('billing_period', billingPeriod);

      if ((count ?? 0) > 0) continue;

      const { error } = await db.from('rating_prompts').insert({
        student_id: studentId,
        class_id: cls.id,
        billing_period: billingPeriod,
        available_at: now,
        expires_at: expiresAt,
      });

      if (!error) created++;
    }
  }

  // Per-session prompts: generate for each completed session not yet prompted
  const { data: sessions } = await db
    .from('sessions')
    .select('id, student_id, class_id')
    .eq('status', 'completed')
    .not('class_id', 'is', null);

  for (const session of sessions ?? []) {
    const { count } = await db
      .from('rating_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', session.student_id)
      .eq('class_id', session.class_id)
      .eq('billing_period', session.id);

    if ((count ?? 0) > 0) continue;

    const { error } = await db.from('rating_prompts').insert({
      student_id: session.student_id,
      class_id: session.class_id,
      billing_period: session.id,
      available_at: now,
      expires_at: expiresAt,
    });

    if (!error) created++;
  }

  console.log(`[generate-rating-prompts] created ${created} prompts`);
  return NextResponse.json({ created });
}
