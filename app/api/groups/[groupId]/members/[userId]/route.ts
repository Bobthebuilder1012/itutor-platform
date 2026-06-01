import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { promoteNextFromWaitlist } from '@/lib/services/waitlistService';

type Params = { params: Promise<{ groupId: string; userId: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PATCH /api/groups/[groupId]/members/[userId] — tutor manages a member's status
// Handles: approved, active, denied, suspended, banned, removed
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

    const body = await request.json();
    const { status, reason, suspended_until }: { status: string; reason?: string; suspended_until?: string | null } = body;

    const allowed = ['approved', 'active', 'denied', 'suspended', 'banned', 'removed'];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const update: Record<string, unknown> = { status };
    if (reason !== undefined) update.action_reason = reason || null;
    if (['suspended', 'banned', 'removed'].includes(status)) {
      update.actioned_at = new Date().toISOString();
      update.actioned_by = user.id;
    }
    if (status === 'suspended') {
      update.suspended_until = suspended_until ?? null;
    }
    if (status === 'approved' || status === 'active') {
      update.action_reason = null;
      update.actioned_at = null;
      update.actioned_by = null;
      update.suspended_until = null;
    }

    const { data: existing } = await service
      .from('group_members')
      .select('status')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
    const previousStatus = (existing as any)?.status ?? null;

    const { data: member, error } = await service
      .from('group_members')
      .update(update)
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    const isDecline = status === 'removed' && previousStatus === 'pending';
    const notifMap: Record<string, { type: string; title: string; message: string }> = {
      approved:  { type: 'ENROLLMENT_CONFIRMED',   title: `You're in — ${group.name}!`,       message: `Your request to join "${group.name}" has been approved. You can now access the stream and upcoming sessions.` },
      denied:    { type: 'join_request_declined',  title: 'Request not approved',             message: `Your request to join "${group.name}" was not approved by the tutor.` },
      suspended: { type: 'group_member_suspended', title: 'Access suspended',                 message: `Your access to "${group.name}" has been suspended${suspended_until ? ` until ${new Date(suspended_until).toLocaleDateString('en-TT', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}.${reason ? ` Reason: ${reason}` : ''} You can still leave the class at any time.` },
      banned:    { type: 'group_member_banned',    title: 'Removed from class',               message: `You have been permanently removed from "${group.name}".${reason ? ` Reason: ${reason}` : ''}` },
      removed:   isDecline
        ? { type: 'join_request_declined', title: 'Request declined',   message: `Your request to join "${group.name}" was not approved by the tutor.` }
        : { type: 'group_member_removed',  title: 'Removed from class', message: `You have been removed from "${group.name}".${reason ? ` Reason: ${reason}` : ''}` },
    };
    const notif = notifMap[status];
    if (notif) {
      try {
        await service.from('notifications').insert({
          user_id: userId, ...notif, link: `/student/classes`, group_id: groupId,
        });
      } catch { /* Non-critical */ }
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
      .select('tutor_id, name, whatsapp_link, google_classroom_link')
      .eq('id', groupId)
      .single();

    const isTutor = group?.tutor_id === user.id;
    const isSelf = userId === user.id;

    if (!isTutor && !isSelf) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

  // Notify student + tutor, including WhatsApp/Classroom reminder for tutor
  try {
    const { data: studentProfile } = await admin
      .from('profiles').select('full_name, display_name').eq('id', userId).single();
    const studentName = (studentProfile as any)?.display_name || (studentProfile as any)?.full_name || 'A student';
    const channelParts = [(group as any)?.whatsapp_link ? 'WhatsApp group' : null, (group as any)?.google_classroom_link ? 'Google Classroom' : null].filter(Boolean);
    const channelNote = channelParts.length > 0 ? ` Remember to remove them from your ${channelParts.join(' and ')}.` : '';

    await admin.from('notifications').insert([
      {
        user_id: userId, type: 'group_left', title: 'Left class',
        message: `You have left "${groupName}".`, link: '/student/classes', group_id: groupId,
      },
      ...((group as any)?.tutor_id ? [{
        user_id: (group as any).tutor_id, type: 'student_left_class',
        title: `${studentName} left ${groupName}`,
        message: `${studentName} left "${groupName}".${channelNote}`,
        link: `/tutor/classes/${groupId}`, group_id: groupId,
      }] : []),
    ]);
  } catch { /* ignore */ }

  return NextResponse.json({ success: true });
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
