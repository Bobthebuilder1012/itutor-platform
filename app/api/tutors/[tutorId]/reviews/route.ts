import { NextRequest } from 'next/server';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ tutorId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { tutorId } = await params;
    const service = getServiceClient();
    const { data, error } = await service
      .from('group_reviews')
      .select(`
        id, rating, comment, created_at,
        group:groups!group_reviews_group_id_fkey(id, name),
        reviewer:profiles!group_reviews_reviewer_id_fkey(id, full_name, avatar_url)
      `)
      .eq('tutor_id', tutorId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) return fail(error.message, 500);
    return ok(data ?? []);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

