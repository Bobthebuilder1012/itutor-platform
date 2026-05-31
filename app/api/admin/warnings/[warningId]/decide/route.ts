// =====================================================
// ADMIN: ISSUE OR DISMISS RELIABILITY WARNING
// =====================================================
// POST /api/admin/warnings/:warningId/decide
// Body: { decision: 'issue' | 'dismiss', note?: string }
//
// Issued warnings flip status='issued' + issued_at. For students this
// is what trips the late-cancel fee in current_student_cancel_state.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { warningId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { decision, note } = (await request.json()) as {
    decision?: 'issue' | 'dismiss';
    note?: string;
  };

  if (decision !== 'issue' && decision !== 'dismiss') {
    return NextResponse.json(
      { error: "decision must be 'issue' or 'dismiss'" },
      { status: 400 }
    );
  }

  const admin = getServiceClient();

  const { data: warning } = await admin
    .from('reliability_warnings')
    .select('id, user_id, user_role, flag_reason, status')
    .eq('id', params.warningId)
    .maybeSingle();

  if (!warning) {
    return NextResponse.json({ error: 'Warning not found' }, { status: 404 });
  }
  if (warning.status !== 'pending_admin') {
    return NextResponse.json(
      { error: `Warning is in '${warning.status}' state` },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> =
    decision === 'issue'
      ? { status: 'issued', issued_by: auth.user!.id, issued_at: now, issued_note: note?.trim() || null }
      : { status: 'dismissed', dismissed_by: auth.user!.id, dismissed_at: now, dismissed_note: note?.trim() || null };

  const { error: updateError } = await admin
    .from('reliability_warnings')
    .update(update)
    .eq('id', warning.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // If admin issues a suspension-threshold warning, freeze the tutor.
  if (decision === 'issue' && warning.flag_reason === 'tutor_suspension_threshold') {
    await admin.from('profiles').update({ is_suspended: true }).eq('id', warning.user_id);
  }

  if (decision === 'issue') {
    try {
      await admin.from('notifications').insert({
        user_id: warning.user_id,
        type: 'reliability_warning_issued',
        title: 'Reliability warning issued',
        message:
          warning.flag_reason === 'tutor_suspension_threshold'
            ? 'Your account has been temporarily suspended due to repeated reliability issues. Contact support to appeal.'
            : warning.flag_reason === 'tutor_strike_threshold'
              ? 'You have received a reliability warning. Two more strikes will trigger a suspension review.'
              : 'You have received a cancellation reliability warning. Late cancellations (under 12 hours) will now incur a 50% fee.',
        link: '/account/reliability',
      });
    } catch (e) {
      console.error('warnings/decide: notification insert failed', e);
    }
  }

  return NextResponse.json({ success: true, status: update.status });
}
