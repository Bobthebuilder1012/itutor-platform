// POST /api/groups/[groupId]/subscribe
// Creates a LuniPay checkout for a MONTHLY group subscription.
// Implements the 14-step decision tree from the subscription billing plan.

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

type Params = { params: Promise<{ groupId: string }> };

const SEAT_RESERVATION_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;

    // Step 1: Auth — student only
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    // Step 2: Group must exist and be PUBLISHED
    const { data: group, error: groupErr } = await admin
      .from('groups')
      .select(`
        id, tutor_id, name, status, pricing_model, price_monthly,
        max_students, grace_period_days, require_join_requests,
        visibility, archived_at
      `)
      .eq('id', groupId)
      .is('archived_at', null)
      .single();

    if (groupErr || !group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (group.status !== 'PUBLISHED') {
      return NextResponse.json({ error: 'Group is not available for enrollment' }, { status: 404 });
    }

    // Step 3: Must be a MONTHLY group with a price
    if (group.pricing_model !== 'MONTHLY' || !group.price_monthly || group.price_monthly <= 0) {
      return NextResponse.json({ error: 'This group does not have a monthly subscription' }, { status: 400 });
    }

    // Tutor cannot subscribe to their own group
    if (group.tutor_id === user.id) {
      return NextResponse.json({ error: 'Tutor cannot subscribe to their own group' }, { status: 403 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: 'Payments are not configured' }, { status: 500 });
    }

    // Step 4: Visibility check
    let memberRow: { id: string; status: string } | null = null;
    if (group.visibility === 'private' || group.require_join_requests) {
      const { data: existing } = await admin
        .from('group_members')
        .select('id, status')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();
      memberRow = existing ?? null;
    }

    if (group.visibility === 'private') {
      if (!memberRow || !['invited', 'approved'].includes(memberRow.status)) {
        return NextResponse.json({ error: 'This group is by invitation only' }, { status: 403 });
      }
    }

    // Step 5: Approval check
    if (group.require_join_requests) {
      if (!memberRow) {
        return NextResponse.json({ error: 'Request to join before subscribing' }, { status: 403 });
      }
      if (memberRow.status === 'pending') {
        return NextResponse.json({ error: 'Your join request is pending tutor approval' }, { status: 409 });
      }
      if (memberRow.status === 'denied') {
        return NextResponse.json({ error: 'Your join request was not approved' }, { status: 403 });
      }
    }

    // Step 6: Reject duplicate non-cancelled active subscription
    const { data: activeEnrollment } = await admin
      .from('group_enrollments')
      .select('id, status, payment_status')
      .eq('group_id', groupId)
      .eq('student_id', user.id)
      .eq('enrollment_type', 'SUBSCRIPTION')
      .in('status', ['ACTIVE', 'GRACE', 'SUSPENDED'])
      .maybeSingle();

    if (activeEnrollment) {
      return NextResponse.json({
        error: 'You already have an active subscription for this group',
        enrollment_id: activeEnrollment.id,
        status: activeEnrollment.status,
      }, { status: 409 });
    }

    const now = new Date();

    // Step 7: Duplicate pending checkout — reuse existing non-expired PENDING_PAYMENT enrollment
    const { data: pendingEnrollment } = await admin
      .from('group_enrollments')
      .select('id, pending_payment_expires_at')
      .eq('group_id', groupId)
      .eq('student_id', user.id)
      .eq('enrollment_type', 'SUBSCRIPTION')
      .eq('status', 'PENDING_PAYMENT')
      .maybeSingle();

    let enrollmentId: string | null = null;
    let isReusingEnrollment = false;

    if (pendingEnrollment && new Date(pendingEnrollment.pending_payment_expires_at ?? 0) > now) {
      enrollmentId = pendingEnrollment.id;
      isReusingEnrollment = true;
    }

    // Step 8: Capacity check (only for new enrollments)
    if (!isReusingEnrollment) {
      if (group.max_students) {
        const nowIso = now.toISOString();

        const { count: occupiedCount } = await admin
          .from('group_enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', groupId)
          .eq('enrollment_type', 'SUBSCRIPTION')
          .in('status', ['ACTIVE', 'GRACE', 'SUSPENDED']);

        const { count: pendingCount } = await admin
          .from('group_enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', groupId)
          .eq('enrollment_type', 'SUBSCRIPTION')
          .eq('status', 'PENDING_PAYMENT')
          .gt('pending_payment_expires_at', nowIso);

        const { count: offeredCount } = await admin
          .from('group_waitlist_entries')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', groupId)
          .eq('status', 'offered')
          .gt('offer_expires_at', nowIso);

        const used = (occupiedCount ?? 0) + (pendingCount ?? 0) + (offeredCount ?? 0);

        if (used >= group.max_students) {
          // Check for existing waitlist entry
          const { data: waitlistEntry } = await admin
            .from('group_waitlist_entries')
            .select('id, position, status')
            .eq('group_id', groupId)
            .eq('student_id', user.id)
            .in('status', ['waiting', 'offered'])
            .maybeSingle();

          if (!waitlistEntry) {
            // Get position (count of waiting entries + 1)
            const { count: waitingCount } = await admin
              .from('group_waitlist_entries')
              .select('id', { count: 'exact', head: true })
              .eq('group_id', groupId)
              .eq('status', 'waiting');

            const position = (waitingCount ?? 0) + 1;

            await admin.from('group_waitlist_entries').insert({
              group_id: groupId,
              student_id: user.id,
              position,
              status: 'waiting',
            });

            return NextResponse.json({ waitlisted: true, position }, { status: 202 });
          }

          return NextResponse.json({
            waitlisted: true,
            position: waitlistEntry.position,
            status: waitlistEntry.status,
          }, { status: 202 });
        }
      }
    }

    // Step 9: Check for active promotions
    let promotionData: {
      promotionId: string | null;
      originalPrice: number;
      discountPercent: number | null;
      discountedPrice: number;
      promotionAppliedAt: string | null;
      promotionDurationDaysSnapshot: number | null;
      promotionExpiresAt: string | null;
    } = {
      promotionId: null,
      originalPrice: group.price_monthly,
      discountPercent: null,
      discountedPrice: group.price_monthly,
      promotionAppliedAt: null,
      promotionDurationDaysSnapshot: null,
      promotionExpiresAt: null,
    };

    if (!isReusingEnrollment) {
      const { data: promotions } = await admin
        .from('group_promotions')
        .select('id, kind, discount, student_cap, duration_days')
        .eq('group_id', groupId)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(5);

      if (promotions && promotions.length > 0) {
        // Find first applicable promotion
        for (const promo of promotions) {
          let applicable = true;

          if (promo.kind === 'early-bird' && promo.student_cap) {
            // Count how many subscribers have used this promotion
            const { count: usedCount } = await admin
              .from('group_enrollments')
              .select('id', { count: 'exact', head: true })
              .eq('group_id', groupId)
              .eq('promotion_id', promo.id)
              .neq('status', 'ACTIVATION_FAILED');

            if ((usedCount ?? 0) >= promo.student_cap) {
              applicable = false;
            }
          }

          if (applicable) {
            const discountedPrice = Math.round(group.price_monthly * (1 - promo.discount / 100) * 100) / 100;
            const appliedAt = now.toISOString();
            let promoExpiresAt: string | null = null;

            if (promo.duration_days) {
              const expiryDate = new Date(now);
              expiryDate.setDate(expiryDate.getDate() + promo.duration_days);
              promoExpiresAt = expiryDate.toISOString();
            }

            promotionData = {
              promotionId: promo.id,
              originalPrice: group.price_monthly,
              discountPercent: promo.discount,
              discountedPrice,
              promotionAppliedAt: appliedAt,
              promotionDurationDaysSnapshot: promo.duration_days ?? null,
              promotionExpiresAt: promoExpiresAt,
            };
            break;
          }
        }
      }
    }

    const finalPrice = promotionData.discountedPrice;
    const pendingExpiresAt = new Date(now.getTime() + SEAT_RESERVATION_MS).toISOString();

    // Step 10: Create or reuse group_enrollments row
    if (!isReusingEnrollment) {
      const { data: newEnrollment, error: enrollErr } = await admin
        .from('group_enrollments')
        .insert({
          group_id: groupId,
          student_id: user.id,
          enrollment_type: 'SUBSCRIPTION',
          status: 'PENDING_PAYMENT',
          payment_status: 'PENDING',
          plan_price_ttd: finalPrice,
          original_price_ttd: promotionData.originalPrice,
          discount_percent: promotionData.discountPercent,
          discounted_price_ttd: promotionData.discountPercent ? finalPrice : null,
          promotion_id: promotionData.promotionId,
          promotion_applied_at: promotionData.promotionAppliedAt,
          promotion_duration_days_snapshot: promotionData.promotionDurationDaysSnapshot,
          promotion_expires_at: promotionData.promotionExpiresAt,
          current_period_start: null,
          current_period_end: null,
          next_payment_due_at: null,
          grace_period_ends_at: null,
          grace_period_days_snapshot: null,
          cancel_at_period_end: false,
          pending_payment_expires_at: pendingExpiresAt,
          reminder_count: 0,
          last_reminder_sent_at: null,
        })
        .select('id')
        .single();

      if (enrollErr || !newEnrollment) {
        console.error('[subscribe] Failed to create enrollment:', enrollErr);
        return NextResponse.json({ error: 'Failed to create enrollment' }, { status: 500 });
      }
      enrollmentId = newEnrollment.id;
    } else {
      // Refresh expiry on existing PENDING_PAYMENT enrollment
      await admin
        .from('group_enrollments')
        .update({ pending_payment_expires_at: pendingExpiresAt })
        .eq('id', enrollmentId);
    }

    // Step 11: Upsert group_members for open groups
    if (!group.require_join_requests && group.visibility !== 'private') {
      await admin
        .from('group_members')
        .upsert(
          { group_id: groupId, user_id: user.id, status: 'approved' },
          { onConflict: 'group_id,user_id', ignoreDuplicates: false }
        );
    }

    // Step 12: Create pending subscription_payments row
    // If reusing enrollment, expire the previous pending payment row first
    if (isReusingEnrollment) {
      const { data: oldPayment } = await admin
        .from('subscription_payments')
        .select('id')
        .eq('enrollment_id', enrollmentId!)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (oldPayment) {
        await expireSubscriptionPayment(admin as any, oldPayment.id);
      }
    }

    const paymentRow = await createPendingSubscriptionPayment(admin as any, {
      enrollmentId: enrollmentId!,
      groupId,
      studentId: user.id,
      type: 'subscription_initial',
      amountTtd: finalPrice,
      originalAmountTtd: promotionData.originalPrice,
      discountPercent: promotionData.discountPercent,
      promotionId: promotionData.promotionId,
    });

    // Update enrollment with checkout_expires_at matching the payment row
    await admin
      .from('subscription_payments')
      .update({ checkout_expires_at: pendingExpiresAt })
      .eq('id', paymentRow.id);

    // Step 13: Create LuniPay checkout session
    const amountCents = ttdToCents(finalPrice);

    // Get student email for checkout
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const { data: authUser } = await supabase.auth.getUser();
    const customerEmail = authUser.user?.email;

    if (!customerEmail) {
      return NextResponse.json({ error: 'Your account is missing an email address' }, { status: 400 });
    }

    const lunipay = getLunipayClient();
    let session: any;
    try {
      session = await lunipay.checkout.sessions.create(
        {
          amount: amountCents,
          currency: 'ttd',
          success_url: `${appUrl}/student/subscriptions/${enrollmentId}/confirmed?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/student/groups/${groupId}`,
          customer_email: customerEmail,
          line_items: [
            {
              name: `${group.name} — Monthly Subscription`,
              quantity: 1,
              amount: amountCents,
            } as any,
          ],
          metadata: {
            type: 'subscription_initial',
            enrollment_id: enrollmentId!,
            group_id: groupId,
            student_id: user.id,
            payment_id: paymentRow.id,
          },
        },
        { idempotencyKey: `subscribe-${paymentRow.id}` }
      );
    } catch (err) {
      if (err instanceof LuniPayError) {
        console.error('[subscribe] LuniPay checkout creation failed:', err);
        return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 502 });
      }
      throw err;
    }

    // Store checkout session id on the payment row
    await admin
      .from('subscription_payments')
      .update({ lunipay_checkout_session_id: session.id })
      .eq('id', paymentRow.id);

    // Step 14: Return checkout URL
    return NextResponse.json({
      checkout_url: session.url,
      enrollment_id: enrollmentId,
      payment_id: paymentRow.id,
    }, { status: 201 });

  } catch (err) {
    console.error('[POST /api/groups/[groupId]/subscribe]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
