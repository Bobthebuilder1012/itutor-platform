// GET /api/subscriptions/my
// Returns all SUBSCRIPTION enrollments for the authenticated student,
// joined with group name and cover image.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    const { data, error } = await admin
      .from('group_enrollments')
      .select(`
        id, group_id, status, payment_status,
        plan_price_ttd, original_price_ttd, discount_percent,
        current_period_start, current_period_end,
        next_payment_due_at, grace_period_ends_at,
        cancel_at_period_end, cancelled_at,
        last_paid_at, reminder_count,
        pending_payment_expires_at,
        enrolled_at, updated_at,
        group:groups!group_id (
          id, name, cover_image, subject, tutor_id,
          tutor:profiles!tutor_id ( id, full_name, avatar_url )
        )
      `)
      .eq('student_id', user.id)
      .eq('enrollment_type', 'SUBSCRIPTION')
      .order('enrolled_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ subscriptions: data ?? [] });

  } catch (err) {
    console.error('[GET /api/subscriptions/my]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
