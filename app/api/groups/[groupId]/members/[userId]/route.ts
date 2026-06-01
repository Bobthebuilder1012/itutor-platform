import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { promoteNextFromWaitlist } from '@/lib/services/waitlistService';
import { refundRemovedSubscription } from '@/lib/payments/subscriptionRemovalRefund';

type Params = { params: Promise<{ groupId: string; userId: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PATCH /api/groups/[groupId]/members/[userId] - approve or deny a join request (tutor only)
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { groupId, userId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    const { data: group } = await service
      .from('groups')
      .select('id, name, tutor_id')
      .eq('id', groupId)
      .single();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { status }: { status: 'approved' | 'denied' } = await request.json();

    if (!['approved', 'denied'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { data: member, error } = await service
      .from('group_members')
      .update({ status })
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    try {
      await service.from('notifications').insert({
        user_id: userId,
        type: status === 'approved' ? 'ENROLLMENT_CONFIRMED' : 'booking_declined',
        title: status === 'approved' ? 'Group request approved' : 'Group request declined',
        message:
          status === 'approved'
            ? `Your request to join "${group.name}" has been approved.`
            : `Your request to join "${group.name}" was not approved.`,
        link: `/groups`,
        group_id: groupId,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json({ member });
  } catch (err) {
    console.error('[PATCH /api/groups/[groupId]/members/[userId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[groupId]/members/[userId]
// Student self-leave keeps paid access until period end.
// Tutor removal is a single flow: full current-month refund, then remove.
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { groupId, userId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();
    const { data: group } = await admin
      .from('groups')
      .select('tutor_id, name')
      .eq('id', groupId)
      .single();

    const isTutor = group?.tutor_id === user.id;
    const isSelf = userId === user.id;

    if (!isTutor && !isSelf) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Body is accepted for backward-compatible clients, but ignored. There is
    // no cause/reason selection anymore.
    await req.json().catch(() => ({}));

    if (isSelf) {
      return handleSelfLeave(admin as any, groupId, userId, group?.name ?? 'this group');
    }

    return handleTutorRemoval(admin as any, {
      groupId,
      groupName: group?.name ?? 'this group',
      studentId: userId,
      tutorId: user.id,
    });
  } catch (err) {
    console.error('[DELETE /api/groups/[groupId]/members/[userId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleSelfLeave(
  admin: any,
  groupId: string,
  userId: string,
  groupName: string
) {
  const { data: subEnrollment } = await admin
    .from('group_enrollments')
    .select('id, status, current_period_end, cancel_at_period_end')
    .eq('group_id', groupId)
    .eq('student_id', userId)
    .eq('enrollment_type', 'SUBSCRIPTION')
    .in('status', ['ACTIVE', 'GRACE'])
    .maybeSingle();

  if (subEnrollment) {
    if (!subEnrollment.cancel_at_period_end) {
      await admin
        .from('group_enrollments')
        .update({ cancel_at_period_end: true, cancelled_at: new Date().toISOString() })
        .eq('id', subEnrollment.id);
    }

    await admin.from('notifications').insert({
      user_id: userId,
      type: 'subscription_cancellation_scheduled',
      title: 'Left group',
      message: `You have left the group. You still have access until ${subEnrollment.current_period_end ? new Date(subEnrollment.current_period_end).toLocaleDateString('en-TT') : 'the end of your paid period'}.`,
      link: `/student/subscriptions`,
      group_id: groupId,
      metadata: { enrollment_id: subEnrollment.id },
    });

    return NextResponse.json({
      success: true,
      access_until: subEnrollment.current_period_end,
      note: 'Subscription cancellation scheduled. Access continues until period end.',
    });
  }

  const { error } = await admin
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) throw error;

  await admin.from('notifications').insert({
    user_id: userId,
    type: 'group_removal',
    title: 'Left group',
    message: `You have left "${groupName}".`,
    link: `/student/groups`,
    group_id: groupId,
  });

  return NextResponse.json({ success: true });
}

async function handleTutorRemoval(
  admin: any,
  args: {
    groupId: string;
    groupName: string;
    studentId: string;
    tutorId: string;
  }
) {
  const { data: subEnrollment } = await admin
    .from('group_enrollments')
    .select(`
      id, status, payment_status, plan_price_ttd,
      activated_subscription_payment_id,
      current_period_start, current_period_end
    `)
    .eq('group_id', args.groupId)
    .eq('student_id', args.studentId)
    .eq('enrollment_type', 'SUBSCRIPTION')
    .in('status', ['ACTIVE', 'GRACE', 'SUSPENDED'])
    .maybeSingle();

  if (!subEnrollment) {
    await admin
      .from('group_members')
      .update({ status: 'removed' })
      .eq('group_id', args.groupId)
      .eq('user_id', args.studentId);

    await admin.from('notifications').insert({
      user_id: args.studentId,
      type: 'group_removal',
      title: 'Removed from group',
      message: `You have been removed from "${args.groupName}".`,
      link: `/student/subscriptions`,
      group_id: args.groupId,
    });

    return NextResponse.json({ success: true, refund_amount: 0 });
  }

  const { data: existingRemoval } = await admin
    .from('group_removals')
    .select('id, status, refund_amount_ttd, refund_issued')
    .eq('enrollment_id', subEnrollment.id)
    .eq('status', 'auto_processed')
    .maybeSingle();

  if (existingRemoval) {
    return NextResponse.json({
      success: true,
      removal_id: existingRemoval.id,
      refund_amount: Number(existingRemoval.refund_amount_ttd ?? 0),
      refund_succeeded: !!existingRemoval.refund_issued,
      note: 'Already processed',
    });
  }

  const paidPayment = await loadCurrentPaidSubscriptionPayment(
    admin,
    subEnrollment.id,
    subEnrollment.activated_subscription_payment_id
  );

  const refundAmount = Number(paidPayment?.amount_ttd ?? 0);

  const { data: removalRow, error: removalError } = await admin
    .from('group_removals')
    .insert({
      group_id: args.groupId,
      enrollment_id: subEnrollment.id,
      student_id: args.studentId,
      tutor_id: args.tutorId,
      with_cause: false,
      reason_category: 'no_cause',
      explanation: 'Student removed by tutor.',
      evidence_url: null,
      status: 'auto_processed',
      refund_amount_ttd: refundAmount,
    })
    .select('id')
    .single();

  if (removalError) {
    return NextResponse.json({ error: removalError.message }, { status: 500 });
  }

  if (!paidPayment || refundAmount <= 0) {
    await finalizeRemoval(admin, {
      enrollmentId: subEnrollment.id,
      removalId: removalRow?.id ?? null,
      refundAmountTtd: 0,
      groupId: args.groupId,
    });

    await notifyStudentRemoved(admin, {
      studentId: args.studentId,
      groupId: args.groupId,
      groupName: args.groupName,
      refundAmountTtd: 0,
      removalId: removalRow?.id ?? null,
      refundPath: 'no_payment',
    });

    return NextResponse.json({
      success: true,
      removal_id: removalRow?.id,
      refund_amount: 0,
      refund_succeeded: false,
    });
  }

  const refundResult = await refundRemovedSubscription({
    admin,
    subscriptionPaymentId: paidPayment.id,
    enrollmentId: subEnrollment.id,
    groupId: args.groupId,
    removalId: removalRow?.id ?? null,
    tutorId: args.tutorId,
    actorId: args.tutorId,
  });

  // Always finalize the removal — the student must be removed regardless of
  // whether the refund succeeds. A failed refund creates an exception for admin
  // follow-up.
  const refundOk = refundResult.ok;
  let refundPath = 'failed';
  let deductionAmountTtd = 0;
  let pendingDeductionTtd = 0;

  if (refundOk) {
    refundPath = refundResult.path;
    deductionAmountTtd = refundResult.deductionAmountTtd;
    pendingDeductionTtd = refundResult.pendingDeductionTtd;
  } else {
    await admin.from('subscription_payment_exceptions').insert({
      subscription_payment_id: paidPayment.id,
      enrollment_id: subEnrollment.id,
      group_id: args.groupId,
      student_id: args.studentId,
      exception_type: 'refund_required',
      status: 'open',
      error_message: `Student removal refund failed: ${refundResult.error}`,
    });

    const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
    if (admins) {
      await admin.from('notifications').insert(
        admins.map((a: { id: string }) => ({
          user_id: a.id,
          type: 'refund_failed_admin_alert',
          title: 'Subscription refund failed — student already removed',
          message: `A full monthly refund for a removed subscriber in "${args.groupName}" failed and requires manual action. The student has been removed.`,
          link: `/admin/subscription-payment-exceptions`,
          group_id: args.groupId,
          metadata: {
            removal_id: removalRow?.id,
            enrollment_id: subEnrollment.id,
            subscription_payment_id: paidPayment.id,
          },
        }))
      );
    }
  }

  await finalizeRemoval(admin, {
    enrollmentId: subEnrollment.id,
    removalId: removalRow?.id ?? null,
    refundAmountTtd: refundOk ? refundAmount : 0,
    groupId: args.groupId,
  });

  await notifyStudentRemoved(admin, {
    studentId: args.studentId,
    groupId: args.groupId,
    groupName: args.groupName,
    refundAmountTtd: refundOk ? refundAmount : 0,
    removalId: removalRow?.id ?? null,
    refundPath,
  });

  return NextResponse.json({
    success: true,
    removal_id: removalRow?.id,
    refund_amount: refundOk ? refundAmount : 0,
    refund_succeeded: refundOk,
    refund_path: refundPath,
    ...(refundOk ? {
      deduction_amount: deductionAmountTtd,
      pending_deduction_amount: pendingDeductionTtd,
    } : {
      note: 'Refund failed. An admin has been alerted to issue the refund manually.',
    }),
  });
}

async function loadCurrentPaidSubscriptionPayment(
  admin: any,
  enrollmentId: string,
  activatedSubscriptionPaymentId: string | null
) {
  if (activatedSubscriptionPaymentId) {
    const { data } = await admin
      .from('subscription_payments')
      .select('id, amount_ttd, lunipay_transaction_id')
      .eq('id', activatedSubscriptionPaymentId)
      .eq('status', 'PAID')
      .maybeSingle();

    if (data) return data;
  }

  const { data } = await admin
    .from('subscription_payments')
    .select('id, amount_ttd, lunipay_transaction_id')
    .eq('enrollment_id', enrollmentId)
    .eq('status', 'PAID')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

async function finalizeRemoval(
  admin: any,
  args: {
    enrollmentId: string;
    removalId: string | null;
    refundAmountTtd: number;
    groupId: string;
  }
) {
  await admin.rpc('process_subscription_removal', {
    p_payload: {
      enrollment_id: args.enrollmentId,
      removal_id: args.removalId,
      refund_amount_ttd: args.refundAmountTtd,
    },
  });

  if (args.refundAmountTtd > 0) {
    await admin
      .from('group_enrollments')
      .update({ payment_status: 'REFUNDED' })
      .eq('id', args.enrollmentId);
  }

  await promoteNextFromWaitlist(admin, args.groupId);
}

async function notifyStudentRemoved(
  admin: any,
  args: {
    studentId: string;
    groupId: string;
    groupName: string;
    refundAmountTtd: number;
    removalId: string | null;
    refundPath: string;
  }
) {
  await admin.from('notifications').insert({
    user_id: args.studentId,
    type: 'subscription_cancellation_finalized',
    title: 'Removed from group',
    message: args.refundAmountTtd > 0
      ? `You have been removed from "${args.groupName}". A full monthly refund of TT$${args.refundAmountTtd.toFixed(2)} has been issued to your original payment method.`
      : `You have been removed from "${args.groupName}".`,
    link: `/student/subscriptions`,
    group_id: args.groupId,
    metadata: {
      removal_id: args.removalId,
      refund_amount: args.refundAmountTtd,
      refund_path: args.refundPath,
    },
  });
}
