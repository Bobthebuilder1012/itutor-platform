import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { recalculateRating } from '@/lib/services/groupReviews';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ reviewId: string }> };

const patchSchema = z.object({
  comment: z.string().min(1),
});

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    const { reviewId } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid body', 400);

    const service = getServiceClient();
    const { data: review } = await service
      .from('group_reviews')
      .select('id, reviewer_id')
      .eq('id', reviewId)
      .single();
    if (!review) return fail('Review not found', 404);
    if (review.reviewer_id !== user.id) return fail('Forbidden', 403);

    const { data: updated, error } = await service
      .from('group_reviews')
      .update({ comment: parsed.data.comment, updated_at: new Date().toISOString() })
      .eq('id', reviewId)
      .select()
      .single();
    if (error) return fail(error.message, 500);
    return ok(updated);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    const { reviewId } = await params;
    const service = getServiceClient();

    const { data: review } = await service
      .from('group_reviews')
      .select('id, reviewer_id, tutor_id')
      .eq('id', reviewId)
      .single();
    if (!review) return fail('Review not found', 404);

    const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    if (review.reviewer_id !== user.id && !isAdmin) return fail('Forbidden', 403);

    const { data: deleted, error } = await service
      .from('group_reviews')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', reviewId)
      .select()
      .single();
    if (error) return fail(error.message, 500);

    await recalculateRating(review.tutor_id);
    return ok(deleted);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

