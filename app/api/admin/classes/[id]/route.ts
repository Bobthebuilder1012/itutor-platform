// DELETE /api/admin/classes/[id] — permanently delete a class.
//
// SUPERADMIN ONLY. Archive is the reversible option every admin gets; this is
// the irreversible one, so it is gated on SUPERADMIN_EMAILS like the rest of
// the destructive surface.
//
// WHY THIS IS GUARDED RATHER THAN A PLAIN DELETE
// groups is the parent of 19 ON DELETE CASCADE relationships. Removing a row
// silently takes subscription_payments, group_enrollments, group_reviews,
// group_messages, stream_posts, group_sessions and the rest with it — i.e. it
// destroys the class's financial history, not just the class. So we refuse by
// default when either of the two things worth protecting is present:
//
//   * PAID subscription_payments  — accounting records; deleting them makes
//     collected revenue disappear from the admin totals retroactively
//   * live enrollments (ACTIVE / GRACE) — students who are in the class now
//
// `force: true` overrides, because a superadmin clearing test data needs it,
// but the counts are recorded in the audit log either way so an unexplained
// gap in the books can always be traced back here.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { isSuperAdmin } from '@/lib/auth/adminAccess';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  if (!isSuperAdmin(auth.profile?.email)) {
    return NextResponse.json(
      { error: 'Permanent delete is superadmin-only. Use Archive instead.' },
      { status: 403 }
    );
  }

  const { id } = params;
  const body = await request.json().catch(() => ({}));
  const reason: string | null =
    typeof body?.reason === 'string' ? body.reason.trim() || null : null;
  const force = body?.force === true;

  const admin = getServiceClient();

  const { data: cls, error: findError } = await admin
    .from('groups')
    .select('id, name, tutor_id, archived_at, price_monthly')
    .eq('id', id)
    .single();
  if (findError || !cls) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  }

  // What would be destroyed alongside the class.
  const [{ count: paidPayments }, { count: liveEnrollments }, { count: totalEnrollments }] =
    await Promise.all([
      admin
        .from('subscription_payments')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', id)
        .eq('status', 'PAID'),
      admin
        .from('group_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', id)
        .in('status', ['ACTIVE', 'GRACE']),
      admin
        .from('group_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', id),
    ]);

  const blockers: string[] = [];
  if ((paidPayments ?? 0) > 0) {
    blockers.push(
      `${paidPayments} paid payment${paidPayments === 1 ? '' : 's'} would be erased from the books`
    );
  }
  if ((liveEnrollments ?? 0) > 0) {
    blockers.push(
      `${liveEnrollments} student${liveEnrollments === 1 ? ' is' : 's are'} still enrolled`
    );
  }

  if (blockers.length > 0 && !force) {
    return NextResponse.json(
      {
        error: `Cannot delete "${cls.name}": ${blockers.join('; ')}. Archive it instead, or resend with force to delete anyway.`,
        blockers,
        paid_payments: paidPayments ?? 0,
        live_enrollments: liveEnrollments ?? 0,
        requires_force: true,
      },
      { status: 409 }
    );
  }

  // Logged BEFORE the delete: the audit row references the class by id, and we
  // want the record to survive even if the delete then fails partway.
  await logAdminAction(
    { id: auth.profile?.id, email: auth.profile?.email },
    {
      action: 'class.delete',
      targetType: 'class',
      targetId: id,
      targetLabel: cls.name || id,
      details: {
        tutor_id: cls.tutor_id,
        price_monthly: cls.price_monthly,
        was_archived: !!cls.archived_at,
        forced: force,
        cascaded_paid_payments: paidPayments ?? 0,
        cascaded_enrollments: totalEnrollments ?? 0,
      },
      reason,
    }
  );

  const { error: deleteError } = await admin.from('groups').delete().eq('id', id);
  if (deleteError) {
    console.error('Admin class delete failed:', deleteError);
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    deleted: { id, name: cls.name },
    cascaded: { paid_payments: paidPayments ?? 0, enrollments: totalEnrollments ?? 0 },
  });
}
