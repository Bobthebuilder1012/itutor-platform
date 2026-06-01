// GET /api/subscriptions/[enrollmentId]/renew
// Creates a fresh LuniPay checkout for a subscription renewal or reactivation.
// Returns a 302 redirect to the checkout URL.
// This route is what /student/subscriptions/[id]/pay calls server-side.

import { NextRequest, NextResponse } from 'next/server';
import { LuniPayError } from 'lunipay';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getLunipayClient, ttdToCents } from '@/lib/payments/lunipayClient';
import { calculateGrossAmount } from '@/lib/payments/grossUp';
import {
  createPendingSubscriptionPayment,
  expireSubscriptionPayment,
} from '@/lib/services/subscriptionPayments';
import type { SubscriptionPaymentType } from '@/lib/types/groups';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ enrollmentId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { enrollmentId } = await params;

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    // Load enrollment + group info
    const { data: enrollment, error: enrErr } = await admin
      .from('group_enrollments')
      .select(`
        id, student_id, group_id, status, payment_status,
        plan_price_ttd, current_period_end, cancel_at_period_end,
        group:groups!group_id ( id, name, tutor_id, pricing_model, price_monthly )
      `)
      .eq('id', enrollmentId)
      .single();

    if (enrErr || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    // Must belong to caller
    if (enrollment.student_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Must be in a renewable/resumable state
    if (!['ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED', 'PENDING_PAYMENT'].includes(enrollment.status)) {
      return NextResponse.json({ error: 'Enrollment is not in a renewable state' }, { status: 400 });
    }

    // For ACTIVE subscriptions, only allow renewal within 14 days of period end.
    // This prevents mid-period double charges where the student pays now
    // and then pays again when the normal renewal reminder fires.
    if (enrollment.status === 'ACTIVE' && enrollment.current_period_end) {
      const periodEnd = new Date(enrollment.current_period_end);
      const daysUntilEnd = (periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilEnd > 14) {
        return NextResponse.json(
          { error: 'Renewal is not available until 14 days before your period ends' },
          { status: 400 }
        );
      }
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

    // Determine payment type
    const paymentType: SubscriptionPaymentType =
      enrollment.status === 'PENDING_PAYMENT'
        ? 'subscription_initial'
        : enrollment.status === 'SUSPENDED' || enrollment.status === 'CANCELLED'
          ? 'subscription_reactivation'
          : 'subscription_renewal';

    // Expire any stale pending payment rows for this enrollment (any type)
    const { data: stalePending } = await admin
      .from('subscription_payments')
      .select('id')
      .eq('enrollment_id', enrollmentId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(5);

    if (stalePending && stalePending.length > 0) {
      await Promise.all(
        stalePending.map((p: { id: string }) => expireSubscriptionPayment(admin as any, p.id))
      );
    }

    // Create new pending payment row
    const paymentRow = await createPendingSubscriptionPayment(admin as any, {
      enrollmentId,
      groupId: enrollment.group_id,
      studentId: user.id,
      type: paymentType,
      amountTtd: price,
    });

    // Get student email
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const customerEmail = authUser?.email;
    if (!customerEmail) {
      return NextResponse.json({ error: 'Your account is missing an email address' }, { status: 400 });
    }

    const groupName = group?.name ?? 'Group Subscription';
    const { grossAmount: grossRenewalPrice, processingFee: renewalFee } = calculateGrossAmount(price);
    const amountCents = ttdToCents(grossRenewalPrice);

    const lunipay = getLunipayClient();
    let session: any;
    try {
      session = await lunipay.checkout.sessions.create(
        {
          amount: amountCents,
          currency: 'ttd',
          success_url: `${appUrl}/student/subscriptions/${enrollmentId}/confirmed?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/student/subscriptions`,
          customer_email: customerEmail,
          line_items: [
            {
              name: `${groupName} — ${paymentType === 'subscription_initial' ? 'Monthly subscription' : paymentType === 'subscription_reactivation' ? 'Reactivation' : 'Renewal'}`,
              quantity: 1,
              amount: amountCents,
            } as any,
          ],
          metadata: {
            type: paymentType,
            enrollment_id: enrollmentId,
            group_id: enrollment.group_id,
            student_id: user.id,
            payment_id: paymentRow.id,
            base_amount_ttd: String(price),
            processing_fee_ttd: String(renewalFee),
          },
        },
        { idempotencyKey: `renew-${paymentRow.id}` }
      );
    } catch (err) {
      if (err instanceof LuniPayError) {
        console.error('[renew] LuniPay checkout creation failed:', err);
        return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 502 });
      }
      throw err;
    }

    await admin
      .from('subscription_payments')
      .update({ lunipay_checkout_session_id: session.id })
      .eq('id', paymentRow.id);

    // Redirect to checkout
    return NextResponse.redirect(session.url, 302);

  } catch (err) {
    console.error('[GET /api/subscriptions/[enrollmentId]/renew]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
