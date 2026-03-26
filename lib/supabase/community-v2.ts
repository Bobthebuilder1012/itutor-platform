// =====================================================
// SCHOOL COMMUNITIES V2 - DATA ACCESS
// =====================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '@/lib/supabase/client';
import type {
  SchoolCommunity,
  SchoolCommunityWithSchool,
  SchoolCommunityMembership,
  SchoolCommunityMessage,
  SchoolCommunityMessageWithAuthor,
  PaginationParams,
} from '@/lib/types/community-v2';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function getClient(client?: SupabaseClient) {
  return client ?? defaultClient;
}

/**
 * Get the current user's school community (RLS restricts to own school).
 * Requires authenticated session.
 */
export async function getMySchoolCommunity(
  client?: SupabaseClient
): Promise<SchoolCommunityWithSchool | null> {
  const supabase = getClient(client);
  const { data, error } = await supabase
    .from('school_communities')
    .select(`
      *,
      school:institutions(id, name)
    `)
    .maybeSingle();

  if (error) throw error;
  return data as SchoolCommunityWithSchool | null;
}

/**
 * Get community by id (RLS: only if it's the user's school community).
 */
export async function getSchoolCommunityById(
  communityId: string,
  client?: SupabaseClient
): Promise<SchoolCommunityWithSchool | null> {
  const supabase = getClient(client);
  const { data, error } = await supabase
    .from('school_communities')
    .select(`
      *,
      school:institutions(id, name)
    `)
    .eq('id', communityId)
    .maybeSingle();

  if (error) throw error;
  return data as SchoolCommunityWithSchool | null;
}

/**
 * Get root messages (feed) for a community, newest-first. Pagination-ready.
 */
export async function getCommunityMessages(
  communityId: string,
  params: PaginationParams = {},
  client?: SupabaseClient
): Promise<SchoolCommunityMessageWithAuthor[]> {
  const supabase = getClient(client);
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = params.offset ?? 0;

  const { data, error } = await supabase
    .from('school_community_messages')
    .select(`
      *,
      author:profiles(id, full_name, username, avatar_url)
    `)
    .eq('community_id', communityId)
    .is('parent_message_id', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []) as SchoolCommunityMessageWithAuthor[];
}

/**
 * Get replies for a message (thread). Pagination-ready.
 */
export async function getThreadReplies(
  parentId: string,
  params: PaginationParams = {},
  client?: SupabaseClient
): Promise<SchoolCommunityMessageWithAuthor[]> {
  const supabase = getClient(client);
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = params.offset ?? 0;

  const { data, error } = await supabase
    .from('school_community_messages')
    .select(`
      *,
      author:profiles(id, full_name, username, avatar_url)
    `)
    .eq('parent_message_id', parentId)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []) as SchoolCommunityMessageWithAuthor[];
}

/**
 * Get pinned messages for a community.
 */
export async function getPinnedMessages(
  communityId: string,
  client?: SupabaseClient
): Promise<SchoolCommunityMessageWithAuthor[]> {
  const supabase = getClient(client);
  const { data, error } = await supabase
    .from('school_community_messages')
    .select(`
      *,
      author:profiles(id, full_name, username, avatar_url)
    `)
    .eq('community_id', communityId)
    .eq('is_pinned', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as SchoolCommunityMessageWithAuthor[];
}

/**
 * Get active members for a community. Pagination-ready.
 */
export async function getCommunityMembers(
  communityId: string,
  params: PaginationParams = {},
  client?: SupabaseClient
): Promise<(SchoolCommunityMembership & { profile?: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } })[]> {
  const supabase = getClient(client);
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = params.offset ?? 0;

  const { data, error } = await supabase
    .from('school_community_memberships')
    .select(`
      *,
      profile:profiles(id, full_name, username, avatar_url)
    `)
    .eq('community_id', communityId)
    .eq('status', 'ACTIVE')
    .order('joined_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []) as (SchoolCommunityMembership & { profile?: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } })[];
}

/**
 * Get current user's membership in a community (if any).
 */
export async function getMyMembership(
  communityId: string,
  client?: SupabaseClient
): Promise<SchoolCommunityMembership | null> {
  const supabase = getClient(client);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('school_community_memberships')
    .select('*')
    .eq('community_id', communityId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  return data as SchoolCommunityMembership | null;
}
