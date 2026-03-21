import { getServiceClient } from '@/lib/supabase/server';

export async function recalculateRating(tutorId: string) {
  const service = getServiceClient();
  const { data, error } = await service
    .from('group_reviews')
    .select('rating')
    .eq('tutor_id', tutorId)
    .is('deleted_at', null);

  if (error) throw new Error(error.message);

  const ratings = (data ?? []).map((r: any) => Number(r.rating)).filter((n) => Number.isFinite(n));
  const totalReviews = ratings.length;
  const averageRating =
    totalReviews === 0 ? 0 : Math.round((ratings.reduce((acc, n) => acc + n, 0) / totalReviews) * 100) / 100;

  const { data: existing } = await service.from('tutor_profiles').select('id').eq('user_id', tutorId).maybeSingle();
  if (existing) {
    await service
      .from('tutor_profiles')
      .update({ average_rating: averageRating, total_reviews: totalReviews, updated_at: new Date().toISOString() })
      .eq('user_id', tutorId);
  } else {
    await service.from('tutor_profiles').insert({
      user_id: tutorId,
      average_rating: averageRating,
      total_reviews: totalReviews,
    });
  }

  return { averageRating, totalReviews };
}

