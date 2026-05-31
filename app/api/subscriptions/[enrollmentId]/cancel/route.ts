// POST /api/subscriptions/[enrollmentId]/cancel
// Schedules a subscription cancellation at the end of the current period.
// Keeps access active until current_period_end; does not issue a refund.
// Does NOT promote the waitlist — cron handles that when period ends.

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
      .select('id, student_id, group_id, status, payment_status, cancel_at_period_end, current_period_end')
      .eq('id', enrollmentId)
      .single();

    if (enrErr || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    if (enrollment.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!['ACTIVE', 'GRACE'].includes(enrollment.status)) {
      return NextResponse.json({ error: 'Enrollment is not active' }, { status: 400 });
    }

    if (enrollment.cancel_at_period_end) {
      return NextResponse.json({ error: 'Cancellation is already scheduled' }, { status: 409 });
    }

    const now = new Date().toISOString();

    const { error: updateErr } = await admin
      .from('group_enrollments')
      .update({
        cancel_at_period_end: true,
        cancelled_at: now,
      })
      .eq('id', enrollmentId);

    if (updateErr) throw updateErr;

    // Notify student and tutor
    const { data: group } = await admin
      .from('groups')
      .select('tutor_id, name')
      .eq('id', enrollment.group_id)
      .single();

    const notifications = [
      {
        user_id: user.id,
        type: 'subscription_cancellation_scheduled',
        title: 'Subscription cancellation scheduled',
        message: `Your subscription will end on ${enrollment.current_period_end ? new Date(enrollment.current_period_end).toLocaleDateString('en-TT') : 'the end of your current period'}. You still have full access until then.`,
        link: `/student/subscriptions`,
        group_id: enrollment.group_id,
        metadata: { enrollment_id: enrollmentId },
      },
    ];

    if (group?.tutor_id) {
      notifications.push({
        user_id: group.tutor_id,
        type: 'subscription_cancellation_scheduled',
        title: 'Student cancellation scheduled',
        message: `A student has cancelled their subscription to "${group.name}". They retain access until the end of their paid period.`,
        link: `/tutor/classes/${enrollment.group_id}`,
        group_id: enrollment.group_id,
        metadata: { enrollment_id: enrollmentId, student_id: user.id },
      } as any);
    }

    await admin.from('notifications').insert(notifications);

    return NextResponse.json({
      cancelled: true,
      access_until: enrollment.current_period_end,
      refund_due: false,
    });

  } catch (err) {
    console.error('[POST /api/subscriptions/[enrollmentId]/cancel]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
