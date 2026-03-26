import { NextRequest } from 'next/server';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ enrollmentId: string }> };

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    const { enrollmentId } = await params;
    const service = getServiceClient();

    const { data: enrollment } = await service
      .from('group_enrollments')
      .select('id, student_id, group_id, status')
      .eq('id', enrollmentId)
      .single();
    if (!enrollment) return fail('Enrollment not found', 404);
    if (enrollment.student_id !== user.id) return fail('Forbidden', 403);

    const { data: updated, error } = await service
      .from('group_enrollments')
      .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
      .eq('id', enrollmentId)
      .select()
      .single();
    if (error) return fail(error.message, 500);

    const { data: nextWaitlisted } = await service
      .from('group_waitlist_entries')
      .select('id, student_id, position')
      .eq('group_id', enrollment.group_id)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextWaitlisted) {
      await service
        .from('group_waitlist_entries')
        .delete()
        .eq('id', nextWaitlisted.id);

      const { data: promoted } = await service
        .from('group_enrollments')
        .insert({
          student_id: nextWaitlisted.student_id,
          group_id: enrollment.group_id,
          enrollment_type: 'SUBSCRIPTION',
          status: 'ACTIVE',
          payment_status: 'PENDING',
          enrolled_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (promoted) {
        await service.from('notifications').insert({
          user_id: nextWaitlisted.student_id,
          type: 'WAITLIST_AVAILABLE',
          title: 'Seat Available',
          message: 'A seat opened up and your enrollment is now active.',
          group_id: enrollment.group_id,
          metadata: { groupId: enrollment.group_id, enrollmentId: promoted.id },
        });
      }
    }

    return ok(updated);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

