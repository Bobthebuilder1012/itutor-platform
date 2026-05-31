// POST /api/subscriptions/[enrollmentId]/reactivate
// For suspended or expired students who need to pay to regain access.
// If group has capacity: creates checkout. If full: adds to waitlist.

import { NextRequest, NextResponse } from 'next/server';
import { LuniPayError } from 'lunipay';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getLunipayClient, ttdToCents } from '@/lib/payments/lunipayClient';
import {
  createPendingSubscriptionPayment,
  expireSubscriptionPayment,
} from '@/lib/services/subscriptionPayments';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
      .select(`
        id, student_id, group_id, status, plan_price_ttd,
        current_period_end,
        group:groups!group_id ( id, name, tutor_id, max_students, price_monthly )
      `)
      .eq('id', enrollmentId)
      .single();

    if (enrErr || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    if (enrollment.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isExpired =
      enrollment.current_period_end &&
      new Date(enrollment.current_period_end) < new Date();

    if (
      !['SUSPENDED', 'CANCELLED'].includes(enrollment.status) &&
      !isExpired
    ) {
      return NextResponse.json({ error: 'Enrollment is not in a reactivatable state' }, { status: 400 });
    }

    const group = enrollment.group as any;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: 'Payments are not configured' }, { status: 500 });
    }

    const price = enrollment.plan_price_ttd ?? group?.price_monthly ?? 0;
    if (!price || price <= 0) {
      return NextResponse.json({ error: 'Could not determine subscription price' }, { status: 400 });
    }

    const now = new Date();

    // Check capacity
    if (group?.max_students) {
      const nowIso = now.toISOString();

      const { count: occupiedCount } = await admin
        .from('group_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', enrollment.group_id)
        .eq('enrollment_type', 'SUBSCRIPTION')
        .in('status', ['ACTIVE', 'GRACE', 'SUSPENDED'])
        .neq('id', enrollmentId);

      const { count: pendingCount } = await admin
        .from('group_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', enrollment.group_id)
        .eq('enrollment_type', 'SUBSCRIPTION')
        .eq('status', 'PENDING_PAYMENT')
        .gt('pending_payment_expires_at', nowIso);

      const used = (occupiedCount ?? 0) + (pendingCount ?? 0);

      if (used >= group.max_students) {
        // Add to waitlist
        const { data: existing } = await admin
          .from('group_waitlist_entries')
          .select('id, position, status')
          .eq('group_id', enrollment.group_id)
          .eq('student_id', user.id)
          .in('status', ['waiting', 'offered'])
          .maybeSingle();

        if (!existing) {
          const { count: waitingCount } = await admin
            .from('group_waitlist_entries')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', enrollment.group_id)
            .eq('status', 'waiting');

          const position = (waitingCount ?? 0) + 1;
          await admin.from('group_waitlist_entries').insert({
            group_id: enrollment.group_id,
            student_id: user.id,
            position,
            status: 'waiting',
          });

          return NextResponse.json({ waitlisted: true, position }, { status: 202 });
        }

        return NextResponse.json({
          waitlisted: true,
          position: existing.position,
          status: existing.status,
        }, { status: 202 });
      }
    }

    // Expire any stale pending reactivation payment rows
    const { data: stalePending } = await admin
      .from('subscription_payments')
      .select('id')
      .eq('enrollment_id', enrollmentId)
      .eq('status', 'PENDING')
      .eq('type', 'subscription_reactivation')
      .order('created_at', { ascending: false })
      .limit(5);

    if (stalePending && stalePending.length > 0) {
      await Promise.all(
        stalePending.map((p: { id: string }) => expireSubscriptionPayment(admin as any, p.id))
      );
    }

    const paymentRow = await createPendingSubscriptionPayment(admin as any, {
      enrollmentId,
      groupId: enrollment.group_id,
      studentId: user.id,
      type: 'subscription_reactivation',
      amountTtd: price,
    });

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const customerEmail = authUser?.email;
    if (!customerEmail) {
      return NextResponse.json({ error: 'Your account is missing an email address' }, { status: 400 });
    }

    const amountCents = ttdToCents(price);
    const lunipay = getLunipayClient();
    let session: any;
    try {
      session = await lunipay.checkout.sessions.create({
        amount: amountCents,
        currency: 'ttd',
        success_url: `${appUrl}/student/subscriptions/${enrollmentId}/confirmed?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/student/subscriptions`,
        customer_email: customerEmail,
        line_items: [
          {
            name: `${group?.name ?? 'Group'} — Reactivation`,
            quantity: 1,
            amount: amountCents,
          } as any,
        ],
        metadata: {
          type: 'subscription_reactivation',
          enrollment_id: enrollmentId,
          group_id: enrollment.group_id,
          student_id: user.id,
          payment_id: paymentRow.id,
        },
      });
    } catch (err) {
      if (err instanceof LuniPayError) {
        console.error('[reactivate] LuniPay checkout creation failed:', err);
        return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 502 });
      }
      throw err;
    }

    await admin
      .from('subscription_payments')
      .update({ lunipay_checkout_session_id: session.id })
      .eq('id', paymentRow.id);

    return NextResponse.json({ checkout_url: session.url, payment_id: paymentRow.id });

  } catch (err) {
    console.error('[POST /api/subscriptions/[enrollmentId]/reactivate]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
