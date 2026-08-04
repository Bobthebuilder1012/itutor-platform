// Admin soft-delete of a 1:1 rating. Sets deleted_at; the ratings_update_tutor_stats
// trigger (mig 191) recomputes profiles.rating_average / rating_count on the
// UPDATE. Requires migration 191 to be applied — if the deleted_at column is
// absent we return a clear, actionable error rather than a raw DB failure.

import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ ratingId: string }> };

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: Params) {
  const { error, profile } = await requireAdmin();
  if (error) return error;

  const { ratingId } = await params;
  const admin = getServiceClient();

  let reason: string | null = null;
  try { reason = (await req.json())?.reason ?? null; } catch { /* body optional */ }

  const { data: rating } = await admin
    .from('ratings')
    .select('id, tutor_id')
    .eq('id', ratingId)
    .single();
  if (!rating) return Response.json({ error: 'Rating not found' }, { status: 404 });

  const { error: updErr } = await admin
    .from('ratings')
    .update({ deleted_at: new Date().toISOString(), deleted_by: profile!.id, deleted_reason: reason })
    .eq('id', ratingId);

  if (updErr) {
    const missingColumn = /deleted_at|column .* does not exist/i.test(updErr.message);
    return Response.json(
      {
        error: missingColumn
          ? 'Soft-delete for 1:1 ratings requires migration 191 (ratings.deleted_at), which is not applied on this environment yet.'
          : updErr.message,
      },
      { status: missingColumn ? 501 : 500 }
    );
  }

  return Response.json({ success: true });
}
