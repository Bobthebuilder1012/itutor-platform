// POST /api/admin/subscription-payment-exceptions/[id]/resolve
// Admin only. Body: { action: 'retry_activation' | 'manual_activate' | 'refund' | 'mark_duplicate', admin_notes: string }
//
// All actions are audited with admin_id, admin_action, before/after status.

import { NextRequest, NextResponse } from 'next/server';
import { LuniPayError } from 'lunipay';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getLunipayClient, ttdToCents } from '@/lib/payments/lunipayClient';
import { handleSubscriptionPayment } from '@/lib/services/subscriptionPayments';
import { calculateCommission } from '@/lib/utils/commissionCalculator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };
type Action = 'retry_activation' | 'manual_activate' | 'refund' | 'mark_duplicate';

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { action, admin_notes } = body as { action: Action; admin_notes?: string };

    const validActions: Action[] = ['retry_activation', 'manual_activate', 'refund', 'mark_duplicate'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Load exception
    const { data: exception, error: excErr } = await admin
      .from('subscription_payment_exceptions')
      .select('id, subscription_payment_id, enrollment_id, group_id, student_id, status, exception_type')
      .eq('id', id)
      .single();

    if (excErr || !exception) {
      return NextResponse.json({ error: 'Exception not found' }, { status: 404 });
    }

    if (['resolved', 'refunded', 'duplicate'].includes(exception.status)) {
      return NextResponse.json({ error: 'Exception is already resolved' }, { status: 409 });
    }

    const now = new Date().toISOString();

    // Load the subscription payment
    const { data: sp } = await admin
      .from('subscription_payments')
      .select('id, amount_ttd, lunipay_checkout_session_id, lunipay_transaction_id, status')
      .eq('id', exception.subscription_payment_id)
      .maybeSingle();

    // ─── RETRY ACTIVATION ────────────────────────────────────────────
    if (action === 'retry_activation') {
      if (!sp) {
        return NextResponse.json({ error: 'Subscription payment not found' }, { status: 404 });
      }

      const result = await handleSubscriptionPayment({
        admin: admin as any,
        subscriptionPaymentId: sp.id,
        lunipaySessionId: sp.lunipay_checkout_session_id ?? '',
        lunipayTransactionId: sp.lunipay_transaction_id ?? null,
        source: 'finalize',
      });

      await admin
        .from('subscription_payment_exceptions')
        .update({
          status: result.ok ? 'resolved' : 'open',
          admin_id: user.id,
          admin_action: 'retry_activation',
          admin_notes: admin_notes ?? null,
          resolved_at: result.ok ? now : null,
          updated_at: now,
        })
        .eq('id', id);

      return NextResponse.json({ ok: result.ok, action, result });
    }

    // ─── MANUAL ACTIVATE ─────────────────────────────────────────────
    if (action === 'manual_activate') {
      if (!sp) {
        return NextResponse.json({ error: 'Subscription payment not found' }, { status: 404 });
      }

      const amountTtd = Number(sp.amount_ttd ?? 0);
      const { platformFee, payoutAmount } = calculateCommission(amountTtd);
      const periodStart = new Date();
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const { data: rpcResult, error: rpcError } = await admin.rpc('activate_subscription', {
        p_payload: {
          subscription_payment_id: sp.id,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          amount_ttd: amountTtd,
          platform_fee_ttd: platformFee,
          tutor_payout_ttd: payoutAmount,
        },
      });

      const ok = !rpcError && (rpcResult as any)?.ok;

      await admin.from('subscription_payments').update({
        status: 'PAID',
        paid_at: now,
        activation_status: ok ? 'succeeded' : 'failed',
      }).eq('id', sp.id);

      await admin
        .from('subscription_payment_exceptions')
        .update({
          status: ok ? 'resolved' : 'open',
          admin_id: user.id,
          admin_action: 'manual_activate',
          admin_notes: admin_notes ?? null,
          resolved_at: ok ? now : null,
          updated_at: now,
        })
        .eq('id', id);

      if (ok) {
        await admin.from('notifications').insert({
          user_id: exception.student_id,
          type: 'subscription_payment_succeeded',
          title: 'Subscription activated',
          message: 'Your subscription has been manually activated by admin.',
          link: `/student/subscriptions`,
          group_id: exception.group_id,
        });
      }

      return NextResponse.json({ ok, action });
    }

    // ─── REFUND ──────────────────────────────────────────────────────
    if (action === 'refund') {
      if (!sp?.lunipay_transaction_id) {
        return NextResponse.json({ error: 'No LuniPay transaction id on this payment' }, { status: 400 });
      }

      const amountTtd = Number(sp.amount_ttd ?? 0);

      try {
        const lunipay = getLunipayClient();
        await lunipay.payments.refund(
          sp.lunipay_transaction_id,
          {
            amount: ttdToCents(amountTtd),
            reason: 'requested_by_customer',
            metadata: { exception_id: id, admin_id: user.id },
          } as any,
          { idempotencyKey: `exc-refund-${id}` }
        );

        await admin.from('subscription_payments').update({ status: 'REFUNDED' }).eq('id', sp.id);

        await admin
          .from('subscription_payment_exceptions')
          .update({
            status: 'refunded',
            admin_id: user.id,
            admin_action: 'refund',
            admin_notes: admin_notes ?? null,
            resolved_at: now,
            updated_at: now,
          })
          .eq('id', id);

        await admin.from('notifications').insert({
          user_id: exception.student_id,
          type: 'subscription_refund_issued',
          title: 'Refund issued',
          message: `A refund of $${amountTtd.toFixed(2)} TTD has been issued to you.`,
          link: `/student/subscriptions`,
          group_id: exception.group_id,
        });

        return NextResponse.json({ ok: true, action, refund_amount: amountTtd });
      } catch (err) {
        const msg = err instanceof LuniPayError ? err.message : (err as Error).message;
        console.error('[admin/exceptions/resolve] LuniPay refund failed:', err);
        return NextResponse.json({ error: `Refund failed: ${msg}` }, { status: 502 });
      }
    }

    // ─── MARK DUPLICATE ──────────────────────────────────────────────
    await admin
      .from('subscription_payment_exceptions')
      .update({
        status: 'duplicate',
        admin_id: user.id,
        admin_action: 'mark_duplicate',
        admin_notes: admin_notes ?? null,
        resolved_at: now,
        updated_at: now,
      })
      .eq('id', id);

    return NextResponse.json({ ok: true, action: 'mark_duplicate' });

  } catch (err) {
    console.error('[POST /api/admin/subscription-payment-exceptions/[id]/resolve]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
