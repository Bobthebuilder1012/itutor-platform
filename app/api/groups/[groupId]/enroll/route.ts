import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

const bodySchema = z
  .object({
    enrollmentType: z.enum(['SUBSCRIPTION', 'SINGLE_SESSION']),
    sessionId: z.string().uuid().optional(),
    paymentRef: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.enrollmentType === 'SINGLE_SESSION' && !value.sessionId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sessionId is required for SINGLE_SESSION' });
    }
  });

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    const { groupId } = await params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid request body', 400);

    const service = getServiceClient();
    const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'student') return fail('Student role required', 403);

    const isSchemaMismatch = (error: any) => {
      const code = String(error?.code ?? '');
      const message = String(error?.message ?? '').toLowerCase();
      return (
        code === '42703' ||
        code === '42P01' ||
        code === 'PGRST200' ||
        code === 'PGRST201' ||
        code === 'PGRST204' ||
        code === 'PGRST205' ||
        message.includes('does not exist') ||
        message.includes('could not find')
      );
    };

    const groupSelects = [
      'id, tutor_id, status, max_students, pricing_model, name',
      'id, tutor_id, max_students, pricing_model, name',
      'id, tutor_id, max_students, name',
      'id, tutor_id, name',
    ];

    let group: any = null;
    let groupErr: any = null;
    for (const selectStr of groupSelects) {
      const result = await service
        .from('groups')
        .select(selectStr)
        .eq('id', groupId)
        .maybeSingle();
      groupErr = result.error;
      group = result.data;
      if (group) break;
      if (!isSchemaMismatch(groupErr)) break;
    }

    if (!group) {
      if (groupErr) console.error('[POST /api/groups/[groupId]/enroll] group lookup failed', groupId, groupErr);
      return fail('Group not found', 404);
    }

    const rawStatus = String((group as any).status ?? '').trim().toLowerCase();
    if (rawStatus && rawStatus !== 'published') {
      return fail('Group is not published', 400);
    }

    const { count: existingActiveCount } = await service
      .from('group_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('student_id', user.id)
      .eq('status', 'ACTIVE');
    if ((existingActiveCount ?? 0) > 0) return fail('Already enrolled', 409);

    const { count: currentEnrollmentCount } = await service
      .from('group_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('status', 'ACTIVE');

    if ((currentEnrollmentCount ?? 0) >= (group.max_students ?? 20)) {
      const { count: waitCount } = await service
        .from('group_waitlist_entries')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId);

      const position = (waitCount ?? 0) + 1;
      const { data: waitlist, error: waitErr } = await service
        .from('group_waitlist_entries')
        .upsert(
          {
            group_id: groupId,
            student_id: user.id,
            joined_at: new Date().toISOString(),
            position,
          },
          { onConflict: 'student_id,group_id' }
        )
        .select()
        .single();
      if (waitErr) return fail(waitErr.message, 500);
      const groupName = (group as { name?: string }).name ?? 'your class';
      try {
        await service.from('notifications').insert([
          {
            user_id: user.id,
            type: 'ENROLLMENT_CONFIRMED',
            title: 'Added to waitlist',
            message: `You're on the waitlist for "${groupName}" (position ${waitlist.position}).`,
            group_id: groupId,
            metadata: { groupId, waitlistPosition: waitlist.position },
          },
          {
            user_id: group.tutor_id,
            type: 'booking_request',
            title: 'Waitlist signup',
            message: `A student joined the waitlist for "${groupName}".`,
            link: `/groups/${groupId}`,
            group_id: groupId,
            metadata: { groupId, studentId: user.id },
          },
        ]);
      } catch {
        // Non-critical
      }
      return ok({ waitlisted: true, position: waitlist.position });
    }

    const paymentStatus =
      group.pricing_model === 'FREE' ? 'FREE' : parsed.data.paymentRef ? 'PAID' : 'PENDING';

    const { data: enrollment, error } = await service
      .from('group_enrollments')
      .insert({
        student_id: user.id,
        group_id: groupId,
        session_id: parsed.data.sessionId ?? null,
        enrollment_type: parsed.data.enrollmentType,
        status: 'ACTIVE',
        payment_status: paymentStatus,
        payment_ref: parsed.data.paymentRef ?? null,
        enrolled_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) return fail(error.message, 500);

    const groupName = (group as { name?: string }).name ?? 'your class';
    try {
      await service.from('notifications').insert([
        {
          user_id: user.id,
          type: 'ENROLLMENT_CONFIRMED',
          title: 'Enrollment Confirmed',
          message: `You have been enrolled in "${groupName}".`,
          group_id: groupId,
          metadata: { groupId, enrollmentId: enrollment.id },
        },
        {
          user_id: group.tutor_id,
          type: 'booking_request',
          title: 'New enrollment',
          message: `A student enrolled in "${groupName}".`,
          link: `/groups/${groupId}`,
          group_id: groupId,
          metadata: { groupId, enrollmentId: enrollment.id, studentId: user.id },
        },
      ]);
    } catch {
      // Non-critical
    }

    return ok(enrollment, 201);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

