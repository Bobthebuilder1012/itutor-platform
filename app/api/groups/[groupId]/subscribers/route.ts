// GET /api/groups/[groupId]/subscribers
// Tutor-only. Returns subscription enrollments with student profile,
// payment status, period dates, cancellation/suspension state.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor } from '@/lib/auth/groupAccess';
import { firstEverSession, isShortClass } from '@/lib/payments/secureSpot';
import type { SessionPattern } from '@/lib/utils/scheduleFormat';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    // Verify tutor ownership (or superadmin acting as tutor)
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (!actor.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await admin
      .from('group_enrollments')
      .select(`
        id, student_id, status, payment_status,
        plan_price_ttd, original_price_ttd, discount_percent,
        current_period_start, current_period_end,
        next_payment_due_at, grace_period_ends_at,
        cancel_at_period_end, cancelled_at, removal_reason,
        last_paid_at, reminder_count, secured_at, release_date,
        pending_payment_expires_at, enrolled_at, updated_at,
        student:profiles!student_id ( id, full_name, avatar_url, email )
      `)
      .eq('group_id', groupId)
      .eq('enrollment_type', 'SUBSCRIPTION')
      .order('enrolled_at', { ascending: false });

    if (error) throw error;

    const subscribers = await attachSecuredDetail(admin, groupId, data ?? []);

    return NextResponse.json({ subscribers });

  } catch (err) {
    console.error('[GET /api/groups/[groupId]/subscribers]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Adds a `secured` block to enrolments that hold a spot rather than a live
 * subscription, so the roster can say what is held and when it releases.
 *
 * Computed here rather than in the page because the amount lives in
 * subscription_payments and "short class" needs the class end date against the
 * first session — neither of which the tutor's class page holds. It also keeps
 * a mixed roster honest: a class can carry both real subscribers and secured
 * students, and only the latter have money held.
 *
 * The held figure is the TUTOR'S share, not the student's price. A tutor
 * reading "held: TT$250" would expect TT$250 to land in their account.
 */
async function attachSecuredDetail(
  admin: ReturnType<typeof getServiceClient>,
  groupId: string,
  rows: any[]
): Promise<any[]> {
  const secured = rows.filter((r) => r.status === 'SECURED');
  if (secured.length === 0) return rows;

  try {
    const { data: payments } = await admin
      .from('subscription_payments')
      .select('enrollment_id, tutor_payout_ttd, amount_ttd, status')
      .eq('group_id', groupId)
      .eq('type', 'secure_spot');

    const payoutByEnrollment = new Map<string, { held: number; paid: boolean }>();
    for (const p of payments ?? []) {
      payoutByEnrollment.set(p.enrollment_id, {
        held: Number(p.tutor_payout_ttd ?? 0),
        paid: p.status === 'PAID',
      });
    }

    const { data: group } = await admin
      .from('groups')
      .select('end_date')
      .eq('id', groupId)
      .maybeSingle();

    const { data: sessions } = await admin
      .from('group_sessions')
      .select('recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on')
      .eq('group_id', groupId);

    // firstEverSession, not the next one: a secured spot was sold against the
    // class's start, which by then may be in the past.
    const firstSession = firstEverSession((sessions ?? []) as SessionPattern[]);
    const endDate = (group as any)?.end_date ?? null;
    const shortClass = firstSession ? isShortClass({ firstSession, endDate }) : false;

    return rows.map((r) => {
      if (r.status !== 'SECURED') return r;
      const money = payoutByEnrollment.get(r.id);
      return {
        ...r,
        secured: {
          releaseDate: r.release_date ?? null,
          heldTtd: money?.held ?? 0,
          // No money attached — a free reservation. The tutor gets no payment
          // explainer for these, because there is no payment.
          free: !money || money.held <= 0,
          shortClass,
        },
      };
    });
  } catch (err) {
    // Never fail the roster over the extra detail — the tutor still needs the
    // list of who is in their class.
    console.warn('[subscribers] secured detail unavailable (non-fatal):', (err as Error)?.message);
    return rows;
  }
}
