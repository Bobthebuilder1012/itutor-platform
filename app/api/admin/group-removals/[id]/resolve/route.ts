// POST /api/admin/group-removals/[id]/resolve
// Admin only. Body: { decision: 'approve' | 'overturn', admin_notes?: string }
//
// approve  → no refund; set group_members.status = 'removed', mark resolved
// overturn → issue pro-rata refund; if succeeds: remove student, promote waitlist

import { NextRequest, NextResponse } from 'next/server';
import { LuniPayError } from 'lunipay';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getLunipayClient, ttdToCents } from '@/lib/payments/lunipayClient';
import { promoteNextFromWaitlist } from '@/lib/services/waitlistService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    // Verify admin role
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { decision, admin_notes } = body as { decision: 'approve' | 'overturn'; admin_notes?: string };

    if (!['approve', 'overturn'].includes(decision)) {
      return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
    }

    // Load removal record
    const { data: removal, error: remErr } = await admin
      .from('group_removals')
      .select('id, group_id, enrollment_id, student_id, tutor_id, status, with_cause, refund_amount_ttd')
      .eq('id', id)
      .single();

    if (remErr || !removal) {
      return NextResponse.json({ error: 'Removal not found' }, { status: 404 });
    }

    if (!['pending_review', 'auto_processed'].includes(removal.status)) {
      return NextResponse.json({ error: 'Removal is already resolved' }, { status: 409 });
    }

    const { data: group } = await admin
      .from('groups')
      .select('name')
      .eq('id', removal.group_id)
      .single();

    const now = new Date().toISOString();

    // ─── APPROVE ─────────────────────────────────────────────────────
    if (decision === 'approve') {
      // No refund; permanently remove
      await admin
        .from('group_members')
        .update({ status: 'removed' })
        .eq('group_id', removal.group_id)
        .eq('user_id', removal.student_id);

      if (removal.enrollment_id) {
        await admin
          .from('group_enrollments')
          .update({ status: 'CANCELLED', cancelled_at: now })
          .eq('id', removal.enrollment_id);
      }

      await admin
        .from('group_removals')
        .update({
          status: 'approved',
          admin_id: user.id,
          admin_notes: admin_notes ?? null,
          resolved_at: now,
        })
        .eq('id', id);

      // Notify student + tutor
      await admin.from('notifications').insert([
        {
          user_id: removal.student_id,
          type: 'with_cause_removal_admin_decision',
          title: 'Group removal upheld',
          message: `Your removal from "${group?.name}" has been upheld by admin.`,
          link: `/student/subscriptions`,
          group_id: removal.group_id,
          metadata: { removal_id: id, decision: 'approve' },
        },
        {
          user_id: removal.tutor_id,
          type: 'with_cause_removal_admin_decision',
          title: 'Removal approved',
          message: `Your with-cause removal in "${group?.name}" has been approved.`,
          link: `/tutor/classes/${removal.group_id}`,
          group_id: removal.group_id,
          metadata: { removal_id: id, decision: 'approve' },
        },
      ]);

      return NextResponse.json({ ok: true, decision: 'approved' });
    }

    // ─── OVERTURN ────────────────────────────────────────────────────
    // Find PAID subscription payment for refund
    const { data: paidPayment } = await admin
      .from('subscription_payments')
      .select('id, amount_ttd, lunipay_transaction_id')
      .eq('enrollment_id', removal.enrollment_id)
      .eq('status', 'PAID')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Re-compute refund amount using same formula as tutor removal
    let refundAmount = Number(removal.refund_amount_ttd ?? 0);

    if (paidPayment && refundAmount === 0) {
      const { data: enrollment } = await admin
        .from('group_enrollments')
        .select('plan_price_ttd, current_period_start, current_period_end')
        .eq('id', removal.enrollment_id)
        .single();

      if (enrollment) {
        const planPrice = Number(enrollment.plan_price_ttd ?? 0);
        const periodStart = enrollment.current_period_start ? new Date(enrollment.current_period_start) : null;
        const periodEnd = enrollment.current_period_end ? new Date(enrollment.current_period_end) : null;
        const nowDate = new Date();

        if (periodStart && periodEnd && planPrice > 0) {
          const totalDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000));
          const daysRemaining = Math.max(0, Math.round((periodEnd.getTime() - nowDate.getTime()) / 86400000));
          refundAmount = Math.round(planPrice * (daysRemaining / totalDays) * 100) / 100;
        }
      }
    }

    // Create refund row
    const { data: refundRow } = await admin
      .from('subscription_refunds')
      .insert({
        subscription_payment_id: paidPayment?.id ?? null,
        enrollment_id: removal.enrollment_id,
        group_removal_id: id,
        amount_ttd: refundAmount,
        status: 'pending',
      })
      .select('id')
      .single();

    // Attempt LuniPay refund
    if (paidPayment?.lunipay_transaction_id && refundAmount > 0) {
      try {
        const lunipay = getLunipayClient();
        const refundResult = await lunipay.payments.refund(
          paidPayment.lunipay_transaction_id,
          {
            amount: ttdToCents(refundAmount),
            reason: 'requested_by_customer',
            metadata: { removal_id: id, admin_id: user.id },
          } as any,
          { idempotencyKey: `sub-overturn-${id}` }
        );

        await admin
          .from('subscription_refunds')
          .update({ status: 'succeeded', lunipay_refund_id: (refundResult as any)?.id ?? null })
          .eq('id', refundRow?.id);
      } catch (err) {
        const msg = err instanceof LuniPayError ? err.message : (err as Error).message;
        console.error('[admin/resolve] LuniPay refund failed:', err);

        await admin
          .from('subscription_refunds')
          .update({ status: 'failed', error_message: msg })
          .eq('id', refundRow?.id);

        await admin.from('subscription_payment_exceptions').insert({
          subscription_payment_id: paidPayment?.id ?? null,
          enrollment_id: removal.enrollment_id,
          group_id: removal.group_id,
          student_id: removal.student_id,
          exception_type: 'refund_required',
          status: 'open',
          error_message: `Overturn refund failed: ${msg}`,
        });

        return NextResponse.json({ error: 'Refund failed — removal not finalized. Admin exception created.' }, { status: 502 });
      }
    } else if (refundAmount === 0) {
      await admin
        .from('subscription_refunds')
        .update({ status: 'succeeded' })
        .eq('id', refundRow?.id);
    }

    // Call process_subscription_removal RPC
    await admin.rpc('process_subscription_removal', {
      p_payload: {
        enrollment_id: removal.enrollment_id,
        removal_id: id,
        refund_amount_ttd: refundAmount,
      },
    });

    // Mark removal as overturned
    await admin
      .from('group_removals')
      .update({
        status: 'overturned',
        refund_issued: refundAmount > 0,
        refund_amount_ttd: refundAmount,
        admin_id: user.id,
        admin_notes: admin_notes ?? null,
        resolved_at: now,
      })
      .eq('id', id);

    // Promote waitlist
    await promoteNextFromWaitlist(admin as any, removal.group_id);

    // Notify student + tutor (tutor gets a warning)
    await admin.from('notifications').insert([
      {
        user_id: removal.student_id,
        type: 'with_cause_removal_admin_decision',
        title: 'Removal overturned',
        message: refundAmount > 0
          ? `Your removal from "${group?.name}" was overturned. A refund of $${refundAmount.toFixed(2)} TTD has been issued.`
          : `Your removal from "${group?.name}" was overturned.`,
        link: `/student/subscriptions`,
        group_id: removal.group_id,
        metadata: { removal_id: id, decision: 'overturn', refund_amount: refundAmount },
      },
      {
        user_id: removal.tutor_id,
        type: 'with_cause_removal_admin_decision',
        title: 'Removal overturned',
        message: `Your with-cause removal in "${group?.name}" was overturned by admin${refundAmount > 0 ? ` and a $${refundAmount.toFixed(2)} TTD refund was issued` : ''}.`,
        link: `/tutor/classes/${removal.group_id}`,
        group_id: removal.group_id,
        metadata: { removal_id: id, decision: 'overturn' },
      },
    ]);

    return NextResponse.json({ ok: true, decision: 'overturned', refund_amount: refundAmount });

  } catch (err) {
    console.error('[POST /api/admin/group-removals/[id]/resolve]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
