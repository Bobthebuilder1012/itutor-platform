// POST /api/subscriptions/[enrollmentId]/undo-cancellation
// Reverses a scheduled cancellation while the student is still within their paid period.
// Clears cancel_at_period_end — no new payment created.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ enrollmentId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { enrollmentId } = await params;

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    const { data: enrollment, error: enrErr } = await admin
      .from('group_enrollments')
      .select('id, student_id, group_id, status, cancel_at_period_end, current_period_end')
      .eq('id', enrollmentId)
      .single();

    if (enrErr || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    if (enrollment.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!enrollment.cancel_at_period_end) {
      return NextResponse.json({ error: 'No cancellation is scheduled' }, { status: 400 });
    }

    // Must still be within the paid period
    if (enrollment.current_period_end && new Date(enrollment.current_period_end) < new Date()) {
      return NextResponse.json({ error: 'Paid period has already ended — use reactivate instead' }, { status: 400 });
    }

    const { error: updateErr } = await admin
      .from('group_enrollments')
      .update({
        cancel_at_period_end: false,
        cancelled_at: null,
      })
      .eq('id', enrollmentId);

    if (updateErr) throw updateErr;

    await admin.from('notifications').insert({
      user_id: user.id,
      type: 'subscription_cancellation_scheduled',
      title: 'Cancellation reversed',
      message: 'Your subscription will now automatically renew at the end of your current period.',
      link: `/student/subscriptions`,
      group_id: enrollment.group_id,
      metadata: { enrollment_id: enrollmentId },
    });

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('[POST /api/subscriptions/[enrollmentId]/undo-cancellation]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
