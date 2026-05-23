// =====================================================
// SERVER-SIDE RATE LIMITS — Comments & Reactions v2
// Uses the DB (service-role) to count recent actions.
// =====================================================

import { getServiceClient } from '@/lib/supabase/server';

const COMMENT_LIMIT_PER_DAY = 5;
const REACTION_LIMIT_PER_MINUTE = 20;

export async function checkCommentRateLimit(userId: string): Promise<boolean> {
  const db = getServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [classResult, tutorResult] = await Promise.all([
    db
      .from('class_comments')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId)
      .gte('created_at', since),
    db
      .from('tutor_profile_comments')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId)
      .gte('created_at', since),
  ]);

  const total = (classResult.count ?? 0) + (tutorResult.count ?? 0);
  return total < COMMENT_LIMIT_PER_DAY;
}

export async function checkReactionRateLimit(userId: string): Promise<boolean> {
  const db = getServiceClient();
  const since = new Date(Date.now() - 60 * 1000).toISOString();

  const { count } = await db
    .from('comment_reactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('updated_at', since);

  return (count ?? 0) < REACTION_LIMIT_PER_MINUTE;
}
