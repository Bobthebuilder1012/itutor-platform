import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateUser, requireGroupOwner } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; sessionId: string }> };

const schema = z.object({
  attendance: z.array(
    z.object({
      studentId: z.string().uuid(),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
      durationMinutes: z.number().int().min(0).max(600).optional(),
      participationScore: z.number().min(0).max(100).optional(),
    })
  ),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    const { groupId, sessionId } = await params;
    const isOwner = await requireGroupOwner(groupId, user.id);
    if (!isOwner) return fail('Forbidden', 403);

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid request body', 400);

    const service = getServiceClient();
    const upserts = parsed.data.attendance.map((entry) =>
      service.from('group_attendance_records').upsert(
        {
          session_id: sessionId,
          student_id: entry.studentId,
          status: entry.status,
          duration_minutes: entry.durationMinutes ?? null,
          participation_score: entry.participationScore ?? null,
          marked_at: new Date().toISOString(),
          marked_by_id: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,student_id' }
      )
    );
    await Promise.all(upserts);

    const { data, error } = await service
      .from('group_attendance_records')
      .select('id, session_id, student_id, status, marked_at, marked_by_id')
      .eq('session_id', sessionId);
    if (error) return fail(error.message, 500);

    // Notify tutor when a student has repeated absences.
    const absentees = parsed.data.attendance.filter((a) => a.status === 'ABSENT').map((a) => a.studentId);
    if (absentees.length > 0) {
      try {
        const { data: history } = await service
          .from('group_attendance_records')
          .select('student_id, status')
          .in('student_id', absentees)
          .eq('status', 'ABSENT');
        const absentCounts = new Map<string, number>();
        for (const row of history ?? []) {
          absentCounts.set(row.student_id, (absentCounts.get(row.student_id) ?? 0) + 1);
        }

        const repeated = Array.from(absentCounts.entries()).filter(([, count]) => count >= 3).map(([id]) => id);
        if (repeated.length > 0) {
          await service.from('notifications').insert(
            repeated.map((studentId) => ({
              user_id: user.id,
              type: 'attendance_alert',
              title: 'Repeated student absences',
              message: `Student ${studentId.slice(0, 8)} has missed 3 or more sessions in your group.`,
              link: `/groups/${groupId}`,
              group_id: groupId,
            }))
          );
        }
      } catch {
        // Non-critical analytics notification failure.
      }
    }

    return ok(data ?? []);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

