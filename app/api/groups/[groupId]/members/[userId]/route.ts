import { NextRequest, NextResponse } from 'next/server';
import { LuniPayError } from 'lunipay';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getLunipayClient, ttdToCents } from '@/lib/payments/lunipayClient';
import { promoteNextFromWaitlist } from '@/lib/services/waitlistService';

type Params = { params: Promise<{ groupId: string; userId: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PATCH /api/groups/[groupId]/members/[userId] — approve or deny a join request (tutor only)
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
// Handles three paths:
//   1. Student self-leave     → schedule cancel_at_period_end (no refund, keep access)
//   2. Tutor no-cause removal → pro-rata refund → remove if refund succeeds
//   3. Tutor with-cause       → suspend enrollment, create pending admin review
//
// Body: { with_cause?: boolean, reason_category?: string, explanation?: string, evidence_url?: string }
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

    // Parse body — best-effort, no body is valid for basic self-leave
    let body: {
      with_cause?: boolean;
      reason_category?: string;
      explanation?: string;
      evidence_url?: string;
    } = {};
    try {
      body = await req.json();
    } catch {
      // no body — fine for self-leave
    }

    // ─── PATH 1: Student self-leave ────────────────────────────────────
    if (isSelf) {
      // Check if there's an active subscription enrollment
      const { data: subEnrollment } = await admin
        .from('group_enrollments')
        .select('id, status, current_period_end, cancel_at_period_end')
        .eq('group_id', groupId)
        .eq('student_id', userId)
        .eq('enrollment_type', 'SUBSCRIPTION')
        .in('status', ['ACTIVE', 'GRACE'])
        .maybeSingle();

      if (subEnrollment) {
        // Schedule cancellation — keep access until period end
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

      // Non-subscription member: just delete
      const { error } = await admin
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // ─── TUTOR PATHS: require reason_category + explanation ───────────
    if (!body.reason_category || !body.explanation) {
      return NextResponse.json({ error: 'reason_category and explanation are required' }, { status: 400 });
    }

    const validCategories = ['no_cause', 'behavioral', 'non_payment', 'other'];
    if (!validCategories.includes(body.reason_category)) {
      return NextResponse.json({ error: 'Invalid reason_category' }, { status: 400 });
    }

    const withCause = !!body.with_cause;

    // Load active subscription enrollment for the target student
    const { data: subEnrollment } = await admin
      .from('group_enrollments')
      .select(`
        id, status, payment_status, plan_price_ttd,
        current_period_start, current_period_end
      `)
      .eq('group_id', groupId)
      .eq('student_id', userId)
      .eq('enrollment_type', 'SUBSCRIPTION')
      .in('status', ['ACTIVE', 'GRACE', 'SUSPENDED'])
      .maybeSingle();

    // ─── PATH 3: Tutor with-cause removal ─────────────────────────────
    if (withCause) {
      if (subEnrollment) {
        await admin
          .from('group_enrollments')
          .update({ status: 'SUSPENDED', payment_status: 'PAID' })
          .eq('id', subEnrollment.id);

        await admin
          .from('group_members')
          .update({ status: 'suspended' })
          .eq('group_id', groupId)
          .eq('user_id', userId);
      } else {
        // Non-subscription: plain removal
        await admin
          .from('group_members')
          .update({ status: 'removed' })
          .eq('group_id', groupId)
          .eq('user_id', userId);
      }

      const { data: removalRow } = await admin
        .from('group_removals')
        .insert({
          group_id: groupId,
          enrollment_id: subEnrollment?.id ?? undefined,
          student_id: userId,
          tutor_id: user.id,
          with_cause: true,
          reason_category: body.reason_category,
          explanation: body.explanation,
          evidence_url: body.evidence_url ?? null,
          status: 'pending_review',
        })
        .select('id')
        .single();

      // Hold the tutor's payout for this enrollment pending admin review
      if (subEnrollment) {
        try {
          const { data: paidSp } = await admin
            .from('subscription_payments')
            .select('id')
            .eq('enrollment_id', subEnrollment.id)
            .eq('status', 'PAID')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (paidSp) {
            const { data: ledgerRow } = await admin
              .from('payout_ledger')
              .select('id, status')
              .eq('subscription_payment_id', paidSp.id)
              .maybeSingle();

            if (ledgerRow && ['owed', 'release_ready'].includes(ledgerRow.status)) {
              await (admin as any).rpc('place_payout_hold', {
                p_ledger_id:           ledgerRow.id,
                p_hold_reason:         'student_removed_from_group',
                p_student_id:          userId,
                p_group_id:            groupId,
                p_group_enrollment_id: subEnrollment.id,
                p_group_removal_id:    removalRow?.id,
              });
            } else if (!ledgerRow) {
              // No ledger yet — pre-ledger case so activate_subscription holds it when created
              await admin.from('payout_cases').insert({
                payout_ledger_id:        null,
                subscription_payment_id: paidSp.id,
                tutor_id:                group!.tutor_id,
                student_id:              userId,
                group_id:                groupId,
                group_enrollment_id:     subEnrollment.id,
                group_removal_id:        removalRow?.id,
                hold_reason:             'student_removed_from_group',
                status:                  'open',
              });
            }
          }
        } catch (e) {
          console.error('[DELETE members with-cause] payout hold failed:', e);
        }
      }

      // Notify student + tutor + admin
      const notifications = [
        {
          user_id: userId,
          type: 'with_cause_removal_submitted_for_review',
          title: 'Your group access is under review',
          message: `Your access to "${group?.name}" has been suspended pending an admin review.`,
          link: `/student/subscriptions`,
          group_id: groupId,
          metadata: { removal_id: removalRow?.id },
        },
        {
          user_id: user.id,
          type: 'with_cause_removal_submitted_for_review',
          title: 'Removal submitted for review',
          message: `Your removal request for a student in "${group?.name}" has been submitted.`,
          link: `/tutor/classes/${groupId}`,
          group_id: groupId,
          metadata: { removal_id: removalRow?.id },
        },
      ];

      // Notify admins
      const { data: admins } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

      if (admins) {
        for (const a of admins) {
          notifications.push({
            user_id: a.id,
            type: 'with_cause_removal_submitted_for_review',
            title: 'With-cause removal for review',
            message: `A tutor has submitted a with-cause removal in "${group?.name}".`,
            link: `/admin/group-removals/${removalRow?.id}`,
            group_id: groupId,
            metadata: { removal_id: removalRow?.id },
          } as any);
        }
      }

      await admin.from('notifications').insert(notifications);

      return NextResponse.json({
        success: true,
        removal_id: removalRow?.id,
        status: 'pending_review',
        note: 'Student suspended pending admin review. No refund issued yet.',
      });
    }

    // ─── PATH 2: Tutor no-cause removal ───────────────────────────────
    if (!subEnrollment) {
      // No active subscription — check for a SINGLE_SESSION or other enrollment
      // that may have an outstanding or paid payment.
      const { data: anyEnrollment } = await admin
        .from('group_enrollments')
        .select('id, status, payment_status, plan_price_ttd, enrollment_type')
        .eq('group_id', groupId)
        .eq('student_id', userId)
        .in('status', ['ACTIVE', 'PENDING_PAYMENT'])
        .maybeSingle();

      let associatedPayment: {
        id: string;
        amount_ttd: number;
        lunipay_checkout_session_id: string | null;
        lunipay_transaction_id: string | null;
        status: string;
      } | null = null;

      if (anyEnrollment) {
        const { data: p } = await admin
          .from('subscription_payments')
          .select('id, amount_ttd, lunipay_checkout_session_id, lunipay_transaction_id, status')
          .eq('enrollment_id', anyEnrollment.id)
          .in('status', ['PENDING', 'PAID'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        associatedPayment = p ?? null;
      }

      // Create audit record
      const { data: removalRow } = await admin
        .from('group_removals')
        .insert({
          group_id: groupId,
          enrollment_id: anyEnrollment?.id ?? null,
          student_id: userId,
          tutor_id: user.id,
          with_cause: false,
          reason_category: body.reason_category,
          explanation: body.explanation,
          evidence_url: body.evidence_url ?? null,
          status: associatedPayment ? 'pending_payment_action' : 'auto_processed',
          refund_amount_ttd: 0,
        })
        .select('id')
        .single();

      // Handle payment: refund if paid, flag if pending
      let paymentNote: string | null = null;
      let refundIssued = false;

      if (associatedPayment) {
        if (associatedPayment.status === 'PAID' && associatedPayment.lunipay_transaction_id) {
          const refundAmount = Number(anyEnrollment?.plan_price_ttd ?? associatedPayment.amount_ttd ?? 0);
          try {
            const lunipay = getLunipayClient();
            await lunipay.payments.refund(
              associatedPayment.lunipay_transaction_id,
              {
                amount: ttdToCents(refundAmount),
                reason: 'requested_by_customer',
                metadata: {
                  removal_id: removalRow?.id,
                  enrollment_id: anyEnrollment?.id,
                  group_id: groupId,
                },
              } as any,
              { idempotencyKey: `removal-refund-${removalRow?.id}` }
            );
            await admin.from('subscription_refunds').insert({
              subscription_payment_id: associatedPayment.id,
              enrollment_id: anyEnrollment?.id,
              group_removal_id: removalRow?.id,
              amount_ttd: refundAmount,
              status: 'succeeded',
            });
            await admin
              .from('group_removals')
              .update({ status: 'auto_processed', refund_amount_ttd: refundAmount })
              .eq('id', removalRow?.id);
            refundIssued = true;
            paymentNote = `A refund of TT$${refundAmount.toFixed(2)} has been issued to your original payment method.`;
          } catch (err) {
            const msg = err instanceof LuniPayError ? err.message : (err as Error).message;
            console.error('[DELETE members no-cause] LuniPay refund failed:', err);
            await admin.from('subscription_refunds').insert({
              subscription_payment_id: associatedPayment.id,
              enrollment_id: anyEnrollment?.id,
              group_removal_id: removalRow?.id,
              amount_ttd: refundAmount,
              status: 'failed',
              error_message: msg,
            });
            paymentNote = 'A refund could not be processed automatically. Our team has been alerted and will process it manually.';
          }
        } else if (associatedPayment.status === 'PENDING') {
          // Checkout not yet completed — flag for admin to void
          paymentNote = 'Your pending payment is being cancelled. Our team has been alerted and will confirm once voided.';
        }

        // Alert all admins regardless of refund outcome
        const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
        if (admins) {
          const refundAmount = Number(anyEnrollment?.plan_price_ttd ?? associatedPayment.amount_ttd ?? 0);
          await admin.from('notifications').insert(
            admins.map((a: { id: string }) => ({
              user_id: a.id,
              type: 'group_removal_payment_action',
              title: 'Group removal — payment action required',
              message: refundIssued
                ? `Student removed from "${group?.name}". A refund of TT$${refundAmount.toFixed(2)} was automatically issued.`
                : `Student removed from "${group?.name}". Payment (status: ${associatedPayment!.status}) requires manual review.`,
              link: `/admin/group-removals/${removalRow?.id}`,
              group_id: groupId,
              metadata: {
                removal_id: removalRow?.id,
                enrollment_id: anyEnrollment?.id,
                payment_id: associatedPayment!.id,
                payment_status: associatedPayment!.status,
              },
            }))
          );
        }
      }

      // Mark member removed
      await admin
        .from('group_members')
        .update({ status: 'removed' })
        .eq('group_id', groupId)
        .eq('user_id', userId);

      // Cancel enrollment if present
      if (anyEnrollment) {
        await admin
          .from('group_enrollments')
          .update({ status: 'CANCELLED' })
          .eq('id', anyEnrollment.id);
      }

      // Always notify the student
      await admin.from('notifications').insert({
        user_id: userId,
        type: 'group_removal',
        title: 'Removed from group',
        message: paymentNote
          ? `You have been removed from "${group?.name}". ${paymentNote}`
          : `You have been removed from "${group?.name}".`,
        link: `/student/subscriptions`,
        group_id: groupId,
        metadata: { removal_id: removalRow?.id },
      });

      return NextResponse.json({
        success: true,
        removal_id: removalRow?.id,
        refund_issued: refundIssued,
        payment_action_required: !!(associatedPayment && !refundIssued),
      });
    }

    // Find the last PAID subscription_payments row
    const { data: paidPayment } = await admin
      .from('subscription_payments')
      .select('id, amount_ttd, lunipay_transaction_id')
      .eq('enrollment_id', subEnrollment.id)
      .eq('status', 'PAID')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Also check for a pending checkout that hasn't settled — must be voided by admin
    const { data: pendingCheckout } = await admin
      .from('subscription_payments')
      .select('id, amount_ttd, lunipay_checkout_session_id')
      .eq('enrollment_id', subEnrollment.id)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Calculate pro-rata refund
    let refundAmount = 0;
    const planPrice = Number(subEnrollment.plan_price_ttd ?? 0);

    if (paidPayment && planPrice > 0) {
      const periodStart = subEnrollment.current_period_start
        ? new Date(subEnrollment.current_period_start)
        : null;
      const periodEnd = subEnrollment.current_period_end
        ? new Date(subEnrollment.current_period_end)
        : null;
      const now = new Date();

      if (periodStart && periodEnd && periodEnd > now) {
        // Try session-based formula first
        const { count: totalSessions } = await admin
          .from('group_session_occurrences')
          .select('id', { count: 'exact', head: true })
          .eq('group_sessions.group_id', groupId)
          .neq('status', 'cancelled')
          .gte('scheduled_start_at', periodStart.toISOString())
          .lte('scheduled_start_at', periodEnd.toISOString());

        const { count: remainingSessions } = await admin
          .from('group_session_occurrences')
          .select('id', { count: 'exact', head: true })
          .eq('group_sessions.group_id', groupId)
          .neq('status', 'cancelled')
          .gte('scheduled_start_at', now.toISOString())
          .lte('scheduled_start_at', periodEnd.toISOString());

        if ((totalSessions ?? 0) > 0) {
          refundAmount = Math.round(planPrice * ((remainingSessions ?? 0) / (totalSessions ?? 1)) * 100) / 100;
        } else {
          // Fallback: day-based proration
          const totalDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000));
          const daysRemaining = Math.max(0, Math.round((periodEnd.getTime() - now.getTime()) / 86400000));
          refundAmount = Math.round(planPrice * (daysRemaining / totalDays) * 100) / 100;
        }
      }
    }

    // Idempotency: block double-processing on retry/double-click.
    // If a removal row already exists for this enrollment, return the prior result.
    const { data: existingRemoval } = await admin
      .from('group_removals')
      .select('id, status, refund_amount_ttd')
      .eq('enrollment_id', subEnrollment.id)
      .in('status', ['auto_processed', 'pending_payment_action', 'pending_review'])
      .maybeSingle();

    if (existingRemoval) {
      return NextResponse.json({
        success: true,
        removal_id: existingRemoval.id,
        refund_amount: Number(existingRemoval.refund_amount_ttd ?? 0),
        refund_succeeded: existingRemoval.status === 'auto_processed',
        note: 'Already processed',
      });
    }

    // Create group_removal row (auto_processed)
    const { data: removalRow } = await admin
      .from('group_removals')
      .insert({
        group_id: groupId,
        enrollment_id: subEnrollment.id,
        student_id: userId,
        tutor_id: user.id,
        with_cause: false,
        reason_category: 'no_cause',
        explanation: body.explanation,
        evidence_url: body.evidence_url ?? null,
        status: 'auto_processed',
        refund_amount_ttd: refundAmount,
      })
      .select('id')
      .single();

    // Create subscription_refund row (always create, even if refund = 0)
    const { data: refundRow } = await admin
      .from('subscription_refunds')
      .insert({
        subscription_payment_id: paidPayment?.id,
        enrollment_id: subEnrollment.id,
        group_removal_id: removalRow?.id ?? null,
        amount_ttd: refundAmount,
        status: 'pending',
      })
      .select('id')
      .single();

    // Attempt LuniPay refund (skip if no payment or no refund due)
    let refundSucceeded = false;

    if (paidPayment?.lunipay_transaction_id && refundAmount > 0) {
      try {
        const lunipay = getLunipayClient();
        const refundResult = await lunipay.payments.refund(
          paidPayment.lunipay_transaction_id,
          {
            amount: ttdToCents(refundAmount),
            reason: 'requested_by_customer',
            metadata: {
              removal_id: removalRow?.id,
              enrollment_id: subEnrollment.id,
              group_id: groupId,
            },
          } as any,
          { idempotencyKey: `sub-refund-${removalRow?.id}` }
        );

        await admin
          .from('subscription_refunds')
          .update({ status: 'succeeded', lunipay_refund_id: (refundResult as any)?.id ?? null })
          .eq('id', refundRow?.id);

        refundSucceeded = true;
      } catch (err) {
        const msg = err instanceof LuniPayError ? err.message : (err as Error).message;
        console.error('[DELETE members] LuniPay refund failed:', err);

        await admin
          .from('subscription_refunds')
          .update({ status: 'failed', error_message: msg })
          .eq('id', refundRow?.id);

        // Create admin exception — do NOT remove student yet
        await admin.from('subscription_payment_exceptions').insert({
          subscription_payment_id: paidPayment?.id ?? null,
          enrollment_id: subEnrollment.id,
          group_id: groupId,
          student_id: userId,
          exception_type: 'refund_required',
          status: 'open',
          error_message: `No-cause removal refund failed: ${msg}`,
        });

        // Alert admins
        const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
        if (admins) {
          await admin.from('notifications').insert(
            admins.map((a: { id: string }) => ({
              user_id: a.id,
              type: 'refund_failed_admin_alert',
              title: 'Subscription refund failed',
              message: `A refund for a removed subscriber in "${group?.name}" failed and requires manual action.`,
              link: `/admin/subscription-payment-exceptions`,
              group_id: groupId,
            }))
          );
        }

        return NextResponse.json({
          error: 'Refund failed — student not removed. Admin alerted.',
          removal_id: removalRow?.id,
          refund_id: refundRow?.id,
        }, { status: 502 });
      }
    } else if (refundAmount === 0) {
      // No refund due (no sessions remaining or no paid period)
      await admin
        .from('subscription_refunds')
        .update({ status: 'succeeded' })
        .eq('id', refundRow?.id);
      refundSucceeded = true;
    }

    if (refundSucceeded) {
      // Call process_subscription_removal RPC
      await admin.rpc('process_subscription_removal', {
        p_payload: {
          enrollment_id: subEnrollment.id,
          removal_id: removalRow?.id ?? null,
          refund_amount_ttd: refundAmount,
        },
      });

      // Reverse the payout_ledger row now that the student has been refunded
      if (paidPayment?.id) {
        try {
          const { data: ledgerRow } = await admin
            .from('payout_ledger')
            .select('id')
            .eq('subscription_payment_id', paidPayment.id)
            .neq('status', 'reversed')
            .maybeSingle();

          if (ledgerRow) {
            await (admin as any).rpc('reverse_payout_ledger_row', {
              p_ledger_id:  ledgerRow.id,
              p_removal_id: removalRow?.id ?? null,
            });
          }
        } catch (e) {
          console.error('[DELETE members no-cause] reverse_payout_ledger_row failed:', e);
        }
      }

      // Promote waitlist
      await promoteNextFromWaitlist(admin as any, groupId);

      // Notify student
      await admin.from('notifications').insert({
        user_id: userId,
        type: 'subscription_cancellation_finalized',
        title: 'Removed from group',
        message: refundAmount > 0
          ? `You have been removed from "${group?.name}". A refund of TT$${refundAmount.toFixed(2)} has been issued to your original payment method.`
          : `You have been removed from "${group?.name}".`,
        link: `/student/subscriptions`,
        group_id: groupId,
        metadata: { removal_id: removalRow?.id, refund_amount: refundAmount },
      });
    }

    // If a pending checkout was open at removal time, alert admins to void it before it settles
    if (pendingCheckout) {
      const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
      if (admins) {
        await admin.from('notifications').insert(
          admins.map((a: { id: string }) => ({
            user_id: a.id,
            type: 'group_removal_payment_action',
            title: 'Group removal — pending checkout must be voided',
            message: `Student removed from "${group?.name}" had an open checkout of TT$${Number(pendingCheckout.amount_ttd).toFixed(2)} that has not yet settled. Void checkout ${pendingCheckout.lunipay_checkout_session_id ?? pendingCheckout.id} in LuniPay to prevent the charge from completing.`,
            link: `/admin/group-removals/${removalRow?.id}`,
            group_id: groupId,
            metadata: {
              removal_id: removalRow?.id,
              enrollment_id: subEnrollment.id,
              payment_id: pendingCheckout.id,
              checkout_session_id: pendingCheckout.lunipay_checkout_session_id,
            },
          }))
        );
      }
    }

    return NextResponse.json({
      success: true,
      removal_id: removalRow?.id,
      refund_amount: refundAmount,
      refund_succeeded: refundSucceeded,
    });

  } catch (err) {
    console.error('[DELETE /api/groups/[groupId]/members/[userId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
