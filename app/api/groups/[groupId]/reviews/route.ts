import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { recalculateRating } from '@/lib/services/groupReviews';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

const createSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  sessionId: z.string().uuid(),
});

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  sortBy: z.enum(['recent', 'rating']).default('recent'),
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const { groupId } = await params;
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid body', 400);

    const service = getServiceClient();

    const { data: enrollment } = await service
      .from('group_enrollments')
      .select('id')
      .eq('group_id', groupId)
      .eq('student_id', user.id)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (!enrollment) return fail('Active enrollment required', 403);

    const { data: attendance } = await service
      .from('group_attendance_records')
      .select('id')
      .eq('session_id', parsed.data.sessionId)
      .eq('student_id', user.id)
      .eq('status', 'PRESENT')
      .maybeSingle();
    if (!attendance) return fail('Verified attendance is required', 403);

    const { data: existing } = await service
      .from('group_reviews')
      .select('id')
      .eq('reviewer_id', user.id)
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing) return fail('You already reviewed this group', 409);

    const { data: group } = await service
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();
    if (!group) return fail('Group not found', 404);

    const { data: review, error } = await service
      .from('group_reviews')
      .insert({
        reviewer_id: user.id,
        tutor_id: group.tutor_id,
        group_id: groupId,
        session_id: parsed.data.sessionId,
        rating: parsed.data.rating,
        comment: parsed.data.comment ?? null,
        is_verified: true,
      })
      .select()
      .single();
    if (error) return fail(error.message, 500);

    await recalculateRating(group.tutor_id);
    await service.from('notifications').insert({
      user_id: group.tutor_id,
      type: 'NEW_REVIEW',
      title: 'New Review Received',
      message: 'A student left a new review on your group.',
      group_id: groupId,
      session_occurrence_id: parsed.data.sessionId,
      metadata: { groupId, sessionId: parsed.data.sessionId, rating: parsed.data.rating },
    });

    return ok(review, 201);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const query = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!query.success) return fail('Invalid query', 400);

    const page = query.data.page;
    const limit = query.data.limit;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const service = getServiceClient();
    let reviewsQuery = service
      .from('group_reviews')
      .select(`
        id, rating, comment, created_at, reviewer_id,
        reviewer:profiles!group_reviews_reviewer_id_fkey(full_name, avatar_url)
      `, { count: 'exact' })
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .range(from, to);

    reviewsQuery =
      query.data.sortBy === 'rating'
        ? reviewsQuery.order('rating', { ascending: false })
        : reviewsQuery.order('created_at', { ascending: false });

    const { data, count, error } = await reviewsQuery;
    if (error) return fail(error.message, 500);

    return ok({ items: data ?? [], pagination: { page, limit, total: count ?? 0 } });
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

