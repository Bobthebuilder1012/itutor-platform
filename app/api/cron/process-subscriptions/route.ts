// GET /api/cron/process-subscriptions
// Protected by CRON_SECRET. Runs daily at 8 AM Trinidad (UTC-4 = 12:00 UTC).
//
// Task order matters — finalize cancellations first so they're excluded
// from all downstream grace/suspension tasks.
//
//  1. Finalize period-end cancellations
//  2. Expire PENDING_PAYMENT seat reservations (initial subscriptions only)
//  2b. Expire abandoned renewal/reactivation payment rows
//  3. Expire waitlist offers
//  4. Send payment reminders (only when within grace window of due date)
//  5. Enter grace period (overdue)
//  6. Suspend (grace period elapsed)
//
// ?dry_run=true  →  reads DB, returns what WOULD happen, makes zero writes.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { promoteNextFromWaitlist } from '@/lib/services/waitlistService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true';
  const admin = getAdmin();
  const now = new Date();
  const nowIso = now.toISOString();

  const results: Record<string, unknown> = { dry_run: dryRun };

  // ─── TASK 1: Finalize period-end cancellations ────────────────────
  try {
    const { data: toCancel } = await admin
      .from('group_enrollments')
      .select('id, group_id, student_id')
      .eq('enrollment_type', 'SUBSCRIPTION')
      .eq('cancel_at_period_end', true)
      .neq('status', 'CANCELLED')
      .lt('current_period_end', nowIso);

    if (dryRun) {
      results.task1_cancellations = {
        would_process: (toCancel ?? []).length,
        rows: (toCancel ?? []).map((e) => ({ enrollment_id: e.id, group_id: e.group_id })),
      };
    } else {
      let cancelled = 0;
      const cancelGroupIds = new Set<string>();

      for (const e of toCancel ?? []) {
        await admin
          .from('group_enrollments')
          .update({ status: 'CANCELLED', payment_status: 'PAID' })
          .eq('id', e.id);

        await admin
          .from('group_members')
          .update({ status: 'removed' })
          .eq('group_id', e.group_id)
          .eq('user_id', e.student_id)
          .neq('status', 'removed');

        const { data: group } = await admin.from('groups').select('name, tutor_id').eq('id', e.group_id).single();
        const notifications: any[] = [{
          user_id: e.student_id,
          type: 'subscription_cancellation_finalized',
          title: 'Subscription ended',
          message: `Your subscription to "${group?.name}" has ended.`,
          link: `/student/subscriptions`,
          group_id: e.group_id,
        }];
        if (group?.tutor_id) {
          notifications.push({
            user_id: group.tutor_id,
            type: 'subscription_cancellation_finalized',
            title: 'Student subscription ended',
            message: `A student's subscription to "${group?.name}" has ended.`,
            link: `/tutor/classes/${e.group_id}`,
            group_id: e.group_id,
          });
        }
        await admin.from('notifications').insert(notifications);

        cancelGroupIds.add(e.group_id);
        cancelled++;
      }

      for (const gid of cancelGroupIds) {
        await promoteNextFromWaitlist(admin as any, gid);
      }

      results.task1_cancellations = { processed: cancelled };
    }
  } catch (err) {
    console.error('[cron/process-subscriptions] Task 1 failed:', err);
    results.task1_cancellations = { error: String(err) };
  }

  // ─── TASK 2: Expire PENDING_PAYMENT seat reservations ────────────
  try {
    const { data: expired } = await admin
      .from('group_enrollments')
      .select('id, group_id, student_id')
      .eq('enrollment_type', 'SUBSCRIPTION')
      .eq('status', 'PENDING_PAYMENT')
      .lt('pending_payment_expires_at', nowIso);

    if (dryRun) {
      results.task2_expired_pending = {
        would_process: (expired ?? []).length,
        rows: (expired ?? []).map((e) => ({ enrollment_id: e.id, group_id: e.group_id })),
      };
    } else {
      let expiredCount = 0;
      const expiredGroupIds = new Set<string>();

      for (const e of expired ?? []) {
        await admin
          .from('group_enrollments')
          .update({ status: 'CANCELLED' })
          .eq('id', e.id);

        // Remove the student from group_members if they have no other active
        // enrollment for this group — checkout was abandoned, access must be revoked.
        const { data: otherActive } = await admin
          .from('group_enrollments')
          .select('id')
          .eq('group_id', e.group_id)
          .eq('student_id', e.student_id)
          .in('status', ['ACTIVE', 'GRACE', 'SUSPENDED'])
          .maybeSingle();

        if (!otherActive) {
          await admin
            .from('group_members')
            .update({ status: 'removed' })
            .eq('group_id', e.group_id)
            .eq('user_id', e.student_id)
            .in('status', ['approved', 'active']);
        }

        expiredGroupIds.add(e.group_id);
        expiredCount++;
      }

      for (const gid of expiredGroupIds) {
        const { data: activeOffer } = await admin
          .from('group_waitlist_entries')
          .select('id')
          .eq('group_id', gid)
          .eq('status', 'offered')
          .maybeSingle();

        if (!activeOffer) {
          await promoteNextFromWaitlist(admin as any, gid);
        }
      }

      results.task2_expired_pending = { processed: expiredCount };
    }
  } catch (err) {
    console.error('[cron/process-subscriptions] Task 2 failed:', err);
    results.task2_expired_pending = { error: String(err) };
  }

  // ─── TASK 2b: Expire abandoned renewal/reactivation payment rows ──
  try {
    if (dryRun) {
      const { data: stalePending } = await admin
        .from('subscription_payments')
        .select('id, enrollment_id, type')
        .in('type', ['subscription_renewal', 'subscription_reactivation'])
        .eq('status', 'PENDING')
        .lt('checkout_expires_at', nowIso);
      results.task2b_expired_renewal_payments = {
        would_process: (stalePending ?? []).length,
        rows: stalePending ?? [],
      };
    } else {
      const { error, count } = await admin
        .from('subscription_payments')
        .update({ status: 'expired' })
        .in('type', ['subscription_renewal', 'subscription_reactivation'])
        .eq('status', 'PENDING')
        .lt('checkout_expires_at', nowIso);

      results.task2b_expired_renewal_payments = { processed: count ?? 0, error: error?.message };
    }
  } catch (err) {
    console.error('[cron/process-subscriptions] Task 2b failed:', err);
    results.task2b_expired_renewal_payments = { error: String(err) };
  }

  // ─── TASK 3: Expire waitlist offers ──────────────────────────────
  try {
    if (dryRun) {
      const { data: expiredOffers } = await admin
        .from('group_waitlist_entries')
        .select('id, group_id, student_id:user_id')
        .eq('status', 'offered')
        .lt('offer_expires_at', nowIso);
      results.task3_waitlist_offers = {
        would_expire: (expiredOffers ?? []).length,
        rows: expiredOffers ?? [],
      };
    } else {
      const { data: rpcResult, error: rpcErr } = await admin.rpc('expire_waitlist_offers');
      if (rpcErr) throw rpcErr;

      const expiredOffers = (rpcResult as any[]) ?? [];
      const affectedGroups = new Set<string>(expiredOffers.map((r: any) => r.group_id));

      for (const gid of affectedGroups) {
        const expiredEntry = expiredOffers.find((r: any) => r.group_id === gid);
        if (expiredEntry?.student_id) {
          await admin.from('notifications').insert({
            user_id: expiredEntry.student_id,
            type: 'waitlist_offer_expired',
            title: 'Waitlist offer expired',
            message: 'Your waitlist spot offer has expired. You remain on the waitlist.',
            link: `/student/groups/${gid}`,
            group_id: gid,
          });
        }
        await promoteNextFromWaitlist(admin as any, gid);
      }

      results.task3_waitlist_offers = { expired: expiredOffers.length };
    }
  } catch (err) {
    console.error('[cron/process-subscriptions] Task 3 failed:', err);
    results.task3_waitlist_offers = { error: String(err) };
  }

  // ─── TASK 4: Payment reminders ────────────────────────────────────
  // Only send when next_payment_due_at is within [grace_period_days_snapshot] days from now.
  // This prevents reminders going out immediately after activation or for advance-paid cycles.
  try {
    const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();

    const { data: candidates } = await admin
      .from('group_enrollments')
      .select('id, student_id, group_id, next_payment_due_at, grace_period_days_snapshot, reminder_count')
      .eq('enrollment_type', 'SUBSCRIPTION')
      .eq('status', 'ACTIVE')
      .eq('cancel_at_period_end', false)
      .not('next_payment_due_at', 'is', null)
      .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${twentyThreeHoursAgo}`);

    const toRemind: typeof candidates = [];

    for (const e of candidates ?? []) {
      const dueDate = new Date(e.next_payment_due_at!);
      const graceDays = e.grace_period_days_snapshot ?? 7;
      const msUntilDue = dueDate.getTime() - now.getTime();
      const daysUntilDue = msUntilDue / 86400000;

      // Only remind when within the grace window. Skip if:
      //   - payment is more than graceDays away (too early — advance payment or freshly activated)
      //   - payment is already overdue (daysUntilDue < 0; Task 5 handles that transition)
      if (daysUntilDue > graceDays || daysUntilDue < 0) continue;

      toRemind!.push(e);
    }

    if (dryRun) {
      results.task4_reminders = {
        would_send: toRemind!.length,
        rows: toRemind!.map((e) => ({
          enrollment_id: e.id,
          group_id: e.group_id,
          next_payment_due_at: e.next_payment_due_at,
          days_until_due: Math.round(
            (new Date(e.next_payment_due_at!).getTime() - now.getTime()) / 86400000
          ),
          current_reminder_count: e.reminder_count,
        })),
      };
    } else {
      let remindersSent = 0;

      for (const e of toRemind!) {
        const dueDate = new Date(e.next_payment_due_at!);

        await admin.from('group_enrollments').update({
          last_reminder_sent_at: nowIso,
          reminder_count: (e.reminder_count ?? 0) + 1,
        }).eq('id', e.id);

        await admin.from('notifications').insert({
          user_id: e.student_id,
          type: 'subscription_payment_reminder',
          title: 'Subscription payment due',
          message: `Your subscription payment is due on ${dueDate.toLocaleDateString('en-TT')}.`,
          link: `/student/subscriptions/${e.id}/pay`,
          group_id: e.group_id,
          metadata: { enrollment_id: e.id },
        });

        remindersSent++;
      }

      results.task4_reminders = { sent: remindersSent };
    }
  } catch (err) {
    console.error('[cron/process-subscriptions] Task 4 failed:', err);
    results.task4_reminders = { error: String(err) };
  }

  // ─── TASK 5: Enter grace period ──────────────────────────────────
  try {
    const { data: overdue } = await admin
      .from('group_enrollments')
      .select('id, student_id, group_id, grace_period_days_snapshot')
      .eq('enrollment_type', 'SUBSCRIPTION')
      .eq('status', 'ACTIVE')
      .eq('cancel_at_period_end', false)
      .lt('next_payment_due_at', nowIso);

    if (dryRun) {
      results.task5_grace = {
        would_process: (overdue ?? []).length,
        rows: (overdue ?? []).map((e) => ({ enrollment_id: e.id, group_id: e.group_id })),
      };
    } else {
      let graced = 0;

      for (const e of overdue ?? []) {
        const graceDays = e.grace_period_days_snapshot ?? 7;
        const graceEnd = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000).toISOString();

        await admin.from('group_enrollments').update({
          status: 'GRACE',
          payment_status: 'OVERDUE',
          grace_period_ends_at: graceEnd,
        }).eq('id', e.id);

        const { data: group } = await admin.from('groups').select('name, tutor_id').eq('id', e.group_id).single();
        const notifications: any[] = [{
          user_id: e.student_id,
          type: 'subscription_grace_started',
          title: 'Payment overdue',
          message: `Your subscription to "${group?.name}" is overdue. You have ${graceDays} days to renew before access is suspended.`,
          link: `/student/subscriptions/${e.id}/pay`,
          group_id: e.group_id,
        }];
        if (group?.tutor_id) {
          notifications.push({
            user_id: group.tutor_id,
            type: 'subscription_grace_started',
            title: 'Student payment overdue',
            message: `A student's subscription to "${group?.name}" is overdue.`,
            link: `/tutor/classes/${e.group_id}`,
            group_id: e.group_id,
          });
        }
        await admin.from('notifications').insert(notifications);
        graced++;
      }

      results.task5_grace = { processed: graced };
    }
  } catch (err) {
    console.error('[cron/process-subscriptions] Task 5 failed:', err);
    results.task5_grace = { error: String(err) };
  }

  // ─── TASK 6: Suspend (grace elapsed) ─────────────────────────────
  try {
    const { data: toSuspend } = await admin
      .from('group_enrollments')
      .select('id, student_id, group_id')
      .eq('enrollment_type', 'SUBSCRIPTION')
      .eq('status', 'GRACE')
      .eq('cancel_at_period_end', false)
      .lt('grace_period_ends_at', nowIso);

    if (dryRun) {
      results.task6_suspended = {
        would_process: (toSuspend ?? []).length,
        rows: (toSuspend ?? []).map((e) => ({ enrollment_id: e.id, group_id: e.group_id })),
      };
    } else {
      let suspended = 0;

      for (const e of toSuspend ?? []) {
        await admin.from('group_enrollments').update({ status: 'SUSPENDED' }).eq('id', e.id);
        await admin.from('group_members').update({ status: 'suspended' })
          .eq('group_id', e.group_id)
          .eq('user_id', e.student_id)
          .eq('status', 'approved');

        const { data: group } = await admin.from('groups').select('name, tutor_id').eq('id', e.group_id).single();
        const notifications: any[] = [{
          user_id: e.student_id,
          type: 'subscription_suspended',
          title: 'Subscription suspended',
          message: `Your subscription to "${group?.name}" has been suspended due to non-payment.`,
          link: `/student/subscriptions/${e.id}/pay`,
          group_id: e.group_id,
        }];
        if (group?.tutor_id) {
          notifications.push({
            user_id: group.tutor_id,
            type: 'subscription_suspended',
            title: 'Student suspended',
            message: `A student's subscription to "${group?.name}" has been suspended.`,
            link: `/tutor/classes/${e.group_id}`,
            group_id: e.group_id,
          });
        }
        await admin.from('notifications').insert(notifications);
        suspended++;
      }

      results.task6_suspended = { processed: suspended };
    }
  } catch (err) {
    console.error('[cron/process-subscriptions] Task 6 failed:', err);
    results.task6_suspended = { error: String(err) };
  }

  return NextResponse.json({ ok: true, ran_at: nowIso, ...results });
}
