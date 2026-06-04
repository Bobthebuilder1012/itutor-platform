// GET /api/groups/[groupId]/subscribers
// Tutor-only. Returns subscription enrollments with student profile,
// payment status, period dates, cancellation/suspension state.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

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

    // Verify tutor ownership
    const { data: group } = await admin
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();

    if (!group || group.tutor_id !== user.id) {
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
        last_paid_at, reminder_count,
        pending_payment_expires_at, enrolled_at, updated_at,
        student:profiles!student_id ( id, full_name, avatar_url, email )
      `)
      .eq('group_id', groupId)
      .eq('enrollment_type', 'SUBSCRIPTION')
      .order('enrolled_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ subscribers: data ?? [] });

  } catch (err) {
    console.error('[GET /api/groups/[groupId]/subscribers]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
