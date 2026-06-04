import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ reviewId: string }> };

const patchSchema = z.object({ reply: z.string().min(1).max(1000) });

export const dynamic = 'force-dynamic';

// PATCH — tutor adds or edits their reply on a group_review
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
      .select('id, tutor_id')
      .eq('id', reviewId)
      .is('deleted_at', null)
      .single();
    if (!review) return fail('Review not found', 404);
    if (review.tutor_id !== user.id) return fail('Forbidden — only the tutor can reply', 403);

    const { data: updated, error } = await service
      .from('group_reviews')
      .update({ tutor_reply: parsed.data.reply, tutor_replied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', reviewId)
      .select()
      .single();
    if (error) return fail(error.message, 500);
    return ok(updated);
  } catch (err: any) {
    return fail(err?.message ?? 'Internal server error', 500);
  }
}

// DELETE — tutor removes their reply
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    const { reviewId } = await params;

    const service = getServiceClient();
    const { data: review } = await service
      .from('group_reviews')
      .select('id, tutor_id')
      .eq('id', reviewId)
      .is('deleted_at', null)
      .single();
    if (!review) return fail('Review not found', 404);
    if (review.tutor_id !== user.id) return fail('Forbidden', 403);

    const { data: updated, error } = await service
      .from('group_reviews')
      .update({ tutor_reply: null, tutor_replied_at: null, updated_at: new Date().toISOString() })
      .eq('id', reviewId)
      .select()
      .single();
    if (error) return fail(error.message, 500);
    return ok(updated);
  } catch (err: any) {
    return fail(err?.message ?? 'Internal server error', 500);
  }
}
