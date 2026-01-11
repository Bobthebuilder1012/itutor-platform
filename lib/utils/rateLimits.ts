// =====================================================
// RATE LIMITING UTILITIES
// =====================================================
// Functions to check and enforce rate limits for community actions

import { supabase } from '@/lib/supabase/client';
import type { RateLimitInfo } from '@/lib/types/community';

const QUESTION_LIMIT = 5; // per day per community
const ANSWER_LIMIT = 20; // per day per community

/**
 * Check if user has exceeded question limit in a community
 */
export async function checkQuestionLimit(
  userId: string,
  communityId: string
): Promise<RateLimitInfo> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .eq('community_id', communityId)
    .eq('message_type', 'question')
    .gte('created_at', today.toISOString());

  if (error) throw error;

  const used = count || 0;
  const remaining = Math.max(0, QUESTION_LIMIT - used);
  const allowed = remaining > 0;

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    allowed,
    remaining,
    limit: QUESTION_LIMIT,
    reset_at: tomorrow.toISOString(),
  };
}

/**
 * Check if user has exceeded answer limit in a community
 */
export async function checkAnswerLimit(
  userId: string,
  communityId: string
): Promise<RateLimitInfo> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .eq('community_id', communityId)
    .eq('message_type', 'answer')
    .gte('created_at', today.toISOString());

  if (error) throw error;

  const used = count || 0;
  const remaining = Math.max(0, ANSWER_LIMIT - used);
  const allowed = remaining > 0;

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    allowed,
    remaining,
    limit: ANSWER_LIMIT,
    reset_at: tomorrow.toISOString(),
  };
}

/**
 * Check if user is allowed to post in a community (not restricted/timed out/banned)
 */
export async function checkPostPermission(
  userId: string,
  communityId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: membership, error } = await supabase
    .from('community_memberships')
    .select('status, timed_out_until')
    .eq('user_id', userId)
    .eq('community_id', communityId)
    .single();

  if (error || !membership) {
    return { allowed: false, reason: 'Not a member of this community' };
  }

  if (membership.status === 'banned') {
    return { allowed: false, reason: 'You are banned from this community' };
  }

  if (membership.status === 'restricted') {
    return { allowed: false, reason: 'You have been restricted from posting' };
  }

  if (membership.status === 'timed_out') {
    if (membership.timed_out_until) {
      const timeoutEnd = new Date(membership.timed_out_until);
      if (timeoutEnd > new Date()) {
        return {
          allowed: false,
          reason: `You are timed out until ${timeoutEnd.toLocaleString()}`,
        };
      }
      // Timeout has expired, update status to active
      await supabase
        .from('community_memberships')
        .update({ status: 'active', timed_out_until: null })
        .eq('user_id', userId)
        .eq('community_id', communityId);
    }
  }

  return { allowed: true };
}

/**
 * Check if user is a moderator or admin in a community
 */
export async function checkModeratorPermission(
  userId: string,
  communityId: string
): Promise<boolean> {
  const { data: membership, error } = await supabase
    .from('community_memberships')
    .select('role, status')
    .eq('user_id', userId)
    .eq('community_id', communityId)
    .single();

  if (error || !membership) {
    return false;
  }

  return (
    membership.status === 'active' &&
    (membership.role === 'moderator' || membership.role === 'admin')
  );
}











