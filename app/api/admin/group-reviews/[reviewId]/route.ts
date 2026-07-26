// Admin soft-delete of a group review. Sets deleted_at (audit trail) and
// recomputes the tutor's group-rating aggregate. group_reviews already has
// deleted_at, so this works on the live DB today.

import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { recalculateRating } from '@/lib/services/groupReviews';

type Params = { params: Promise<{ reviewId: string }> };

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error, profile } = await requireAdmin();
  if (error) return error;

  const { reviewId } = await params;
  const admin = getServiceClient();

  const { data: review } = await admin
    .from('group_reviews')
    .select('id, tutor_id, deleted_at')
    .eq('id', reviewId)
    .single();
  if (!review) return Response.json({ error: 'Review not found' }, { status: 404 });
  if (review.deleted_at) return Response.json({ error: 'Review already removed' }, { status: 409 });

  const { error: updErr } = await admin
    .from('group_reviews')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_by: profile!.id })
    .eq('id', reviewId);
  // deleted_by may not exist on group_reviews; retry without it if so.
  if (updErr) {
    const { error: retryErr } = await admin
      .from('group_reviews')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', reviewId);
    if (retryErr) return Response.json({ error: retryErr.message }, { status: 500 });
  }

  try { await recalculateRating(review.tutor_id); } catch { /* aggregate refresh is best-effort */ }
  return Response.json({ success: true });
}
