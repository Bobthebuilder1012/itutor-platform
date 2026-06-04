import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { promoteNextFromWaitlist } from '@/lib/services/waitlistService';

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
// Tutor removal records the removal and cancels the enrollment.
// The refund is separately approved by an admin (see /api/admin/lesson-payments/refund).
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

    const body = await req.json().catch(() => ({}));

    if (isSelf) {
      return handleSelfLeave(admin as any, groupId, userId, group as any, !!body.immediate);
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
  group: any,
  immediate: boolean = false,
) {
  const groupName: string = group?.name ?? 'this group';
  const { data: subEnrollment } = await admin
    .from('group_enrollments')
    .select('id, status, current_period_end, cancel_at_period_end')
    .eq('group_id', groupId)
    .eq('student_id', userId)
    .eq('enrollment_type', 'SUBSCRIPTION')
    .in('status', ['ACTIVE', 'GRACE'])
    .maybeSingle();

  if (subEnrollment) {
    if (immediate) {
      // Cancel subscription AND remove access immediately
      await admin
        .from('group_enrollments')
        .update({
          status: 'CANCELLED',
          cancel_at_period_end: false,
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', subEnrollment.id);

      await admin
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);

      await admin.from('notifications').insert({
        user_id: userId,
        type: 'group_removal',
        title: 'Left class',
        message: `You have left "${groupName}" and your subscription has been cancelled.`,
        link: `/student/classes`,
        group_id: groupId,
        metadata: { enrollment_id: subEnrollment.id },
      });

      return NextResponse.json({
        success: true,
        immediate: true,
        note: 'Subscription cancelled and access removed immediately.',
      });
    }

    // Cancel subscription only — keep access until period end
    if (!subEnrollment.cancel_at_period_end) {
      await admin
        .from('group_enrollments')
        .update({ cancel_at_period_end: true, cancelled_at: new Date().toISOString() })
        .eq('id', subEnrollment.id);
    }

    const accessUntil = subEnrollment.current_period_end
      ? new Date(subEnrollment.current_period_end).toLocaleDateString('en-TT')
      : 'the end of your paid period';

    await admin.from('notifications').insert({
      user_id: userId,
      type: 'subscription_cancellation_scheduled',
      title: 'Subscription cancelled',
      message: `Your subscription to "${groupName}" has been cancelled. You still have access until ${accessUntil}.`,
      link: `/student/classes`,
      group_id: groupId,
      metadata: { enrollment_id: subEnrollment.id },
    });

    return NextResponse.json({
      success: true,
      immediate: false,
      access_until: subEnrollment.current_period_end,
      note: 'Subscription cancellation scheduled. Access continues until period end.',
    });
  }

  // No active subscription — just remove from class immediately
  const { error } = await admin
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) throw error;

  await admin.from('notifications').insert({
    user_id: userId,
    type: 'group_removal',
    title: 'Left class',
    message: `You have left "${groupName}".`,
    link: `/student/classes`,
    group_id: groupId,
  });

  return NextResponse.json({ success: true, immediate: true });
}

// ─── Tutor removal ─────────────────────────────────────────────────────────────

async function handleTutorRemoval(
  admin: any,
  args: {
    groupId: string;
    groupName: string;
    studentId: string;
    tutorId: string;
  }
) {
  // 1. Find the subscription enrollment for this student
  const { data: subEnrollment } = await admin
    .from('group_enrollments')
    .select(`
      id, status, payment_status,
      activated_subscription_payment_id
    `)
    .eq('group_id', args.groupId)
    .eq('student_id', args.studentId)
    .eq('enrollment_type', 'SUBSCRIPTION')
    .in('status', ['ACTIVE', 'GRACE', 'SUSPENDED'])
    .maybeSingle();

  if (!subEnrollment) {
    // No subscription — just mark the group member as removed
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

    await promoteNextFromWaitlist(admin, args.groupId);
    return NextResponse.json({ success: true, refund_amount: 0 });
  }

  // 2. Idempotency — was this enrollment already removed?
  const { data: existingRemoval } = await admin
    .from('group_removals')
    .select('id, status, refund_amount_ttd, refund_issued')
    .eq('enrollment_id', subEnrollment.id)
    .in('status', ['auto_processed', 'approved'])
    .maybeSingle();

  if (existingRemoval) {
    return NextResponse.json({
      success: true,
      removal_id: existingRemoval.id,
      refund_amount: Number(existingRemoval.refund_amount_ttd ?? 0),
      refund_issued: !!existingRemoval.refund_issued,
      note: 'Already processed',
    });
  }

  // 3. Find the paid subscription payment (for refund amount)
  const paidPayment = await loadCurrentPaidSubscriptionPayment(
    admin,
    subEnrollment.id,
    subEnrollment.activated_subscription_payment_id
  );

  const refundAmount = Number(paidPayment?.amount_ttd ?? 0);

  // 4. Create the removal record (refund NOT issued yet — admin approves)
  const now = new Date().toISOString();
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
      refund_issued: false,
    })
    .select('id')
    .single();

  if (removalError) {
    console.error('[handleTutorRemoval] group_removals insert failed:', removalError);
    return NextResponse.json({ error: removalError.message }, { status: 500 });
  }

  // 5. Cancel the enrollment directly (no RPC dependency)
  const { error: enrollError } = await admin
    .from('group_enrollments')
    .update({
      status: 'CANCELLED',
      cancelled_at: now,
      cancel_at_period_end: false,
    })
    .eq('id', subEnrollment.id);

  if (enrollError) {
    console.error('[handleTutorRemoval] enrollment cancel failed:', enrollError);
    return NextResponse.json({ error: `Failed to cancel enrollment: ${enrollError.message}` }, { status: 500 });
  }

  // 6. Remove from group_members
  const { error: memberError } = await admin
    .from('group_members')
    .update({ status: 'removed' })
    .eq('group_id', args.groupId)
    .eq('user_id', args.studentId);

  if (memberError) {
    console.error('[handleTutorRemoval] member remove failed:', memberError);
    // Non-fatal — enrollment is already cancelled
  }

  // 7. Notify the student
  await admin.from('notifications').insert({
    user_id: args.studentId,
    type: 'subscription_cancellation_finalized',
    title: 'Removed from group',
    message: refundAmount > 0
      ? `You have been removed from "${args.groupName}". A refund of TT$${refundAmount.toFixed(2)} is pending admin approval.`
      : `You have been removed from "${args.groupName}".`,
    link: `/student/subscriptions`,
    group_id: args.groupId,
    metadata: {
      removal_id: removalRow?.id,
      refund_amount: refundAmount,
    },
  });

  await promoteNextFromWaitlist(admin, args.groupId);

  return NextResponse.json({
    success: true,
    removal_id: removalRow?.id,
    refund_amount: refundAmount,
    refund_issued: false,
    note: 'Student removed. Refund requires admin approval.',
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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
