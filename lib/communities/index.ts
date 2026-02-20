import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerClient } from '@/lib/supabase/server';
import type {
  CommunityV2,
  CommunityV2WithInstitution,
  CommunityMembershipV2,
  CommunityMembershipV2WithProfile,
  CommunityMessageV2,
  CommunityMessageV2WithAuthor,
  CommunityFavoriteV2,
} from '@/lib/types/communities';

const COMMUNITIES_V2 = 'communities_v2';
const MEMBERSHIPS_V2 = 'community_memberships_v2';
const MESSAGES_V2 = 'community_messages_v2';
const FAVORITES_V2 = 'community_favorites_v2';

export async function getUserCommunities(): Promise<CommunityV2WithInstitution[]> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from(MEMBERSHIPS_V2)
    .select('community_id')
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE');

  if (!memberships?.length) return [];

  const ids = memberships.map((m) => m.community_id);
  const { data } = await supabase
    .from(COMMUNITIES_V2)
    .select(`
      *,
      institution:institutions(id, name)
    `)
    .in('id', ids)
    .order('name');
  return (data as CommunityV2WithInstitution[]) ?? [];
}
/** User's ACTIVE communities with their membership (for muted, muted_until). */
export async function getUserCommunitiesWithMembership(): Promise<
  (CommunityV2WithInstitution & { membership: { muted: boolean; muted_until: string | null } })[]
> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from(MEMBERSHIPS_V2)
    .select('community_id, muted, muted_until')
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE')
    .order('joined_at');

  if (!memberships?.length) return [];

  const ids = memberships.map((m) => m.community_id);
  const { data: communities } = await supabase
    .from(COMMUNITIES_V2)
    .select('*, institution:institutions(id, name)')
    .in('id', ids);

  const communityMap = new Map(
    (communities ?? []).map((c) => [c.id, c as CommunityV2WithInstitution])
  );
  const order = new Map(memberships.map((m, i) => [m.community_id, i]));
  return memberships
    .map((m) => {
      const community = communityMap.get(m.community_id);
      if (!community) return null;
      return {
        ...community,
        membership: { muted: m.muted, muted_until: m.muted_until },
      };
    })
    .filter((c): c is NonNullable<typeof c> => c != null)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Same as getUserCommunitiesWithMembership but using the given client (e.g. service role) to bypass RLS. */
export async function getUserCommunitiesWithMembershipWithClient(
  supabase: SupabaseClient,
  userId: string
): Promise<
  (CommunityV2WithInstitution & { membership: { muted: boolean; muted_until: string | null } })[]
> {
  const { data: memberships } = await supabase
    .from(MEMBERSHIPS_V2)
    .select('community_id, muted, muted_until')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .order('joined_at');

  if (!memberships?.length) return [];

  const ids = memberships.map((m) => m.community_id);
  const { data: communities } = await supabase
    .from(COMMUNITIES_V2)
    .select('*')
    .in('id', ids);

  const list = (communities ?? []) as (CommunityV2WithInstitution & { school_id: string | null })[];
  const schoolIds = [...new Set(list.map((c) => c.school_id).filter(Boolean))] as string[];
  const institutionMap = new Map<string, { id: string; name: string }>();
  if (schoolIds.length > 0) {
    const { data: institutions } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', schoolIds);
    (institutions ?? []).forEach((i) => institutionMap.set(i.id, i));
  }
  const communityMap = new Map(
    list.map((c) => [
      c.id,
      {
        ...c,
        institution: c.school_id ? institutionMap.get(c.school_id) ?? null : null,
      } as CommunityV2WithInstitution,
    ])
  );
  const order = new Map(memberships.map((m, i) => [m.community_id, i]));
  return memberships
    .map((m) => {
      const community = communityMap.get(m.community_id);
      if (!community) return null;
      return {
        ...community,
        membership: { muted: m.muted, muted_until: m.muted_until },
      };
    })
    .filter((c): c is NonNullable<typeof c> => c != null)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function getJoinableCommunities(): Promise<CommunityV2WithInstitution[]> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase.from('profiles').select('institution_id').eq('id', user.id).single();
  const institutionId = profile?.institution_id ?? null;

  const { data: memberIds } = await supabase
    .from(MEMBERSHIPS_V2)
    .select('community_id')
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE');
  const inIds = new Set((memberIds ?? []).map((m) => m.community_id));

  const publicList = await supabase
    .from(COMMUNITIES_V2)
    .select(`*, institution:institutions(id, name)`)
    .eq('type', 'PUBLIC')
    .order('name');
  const schoolList =
    institutionId != null
      ? await supabase
          .from(COMMUNITIES_V2)
          .select(`*, institution:institutions(id, name)`)
          .eq('type', 'SCHOOL')
          .eq('school_id', institutionId)
      : { data: [] };
  const list = [...(publicList.data ?? []), ...(schoolList.data ?? [])];
  const joinable = list.filter((c) => !inIds.has(c.id));
  return joinable as CommunityV2WithInstitution[];
}

/** Same as getJoinableCommunities but using the given client (e.g. service role) to bypass RLS. */
export async function getJoinableCommunitiesWithClient(
  supabase: SupabaseClient,
  userId: string
): Promise<CommunityV2WithInstitution[]> {
  const { data: profile } = await supabase.from('profiles').select('institution_id').eq('id', userId).single();
  const institutionId = profile?.institution_id ?? null;

  const { data: memberRows } = await supabase
    .from(MEMBERSHIPS_V2)
    .select('community_id')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE');
  const inIds = new Set((memberRows ?? []).map((m) => m.community_id));

  const publicList = await supabase
    .from(COMMUNITIES_V2)
    .select('*')
    .eq('type', 'PUBLIC')
    .order('name');
  const schoolList =
    institutionId != null
      ? await supabase
          .from(COMMUNITIES_V2)
          .select('*')
          .eq('type', 'SCHOOL')
          .eq('school_id', institutionId)
      : { data: [] };
  const rawList = [...(publicList.data ?? []), ...(schoolList.data ?? [])] as (CommunityV2WithInstitution & { school_id: string | null })[];
  const schoolIds = [...new Set(rawList.map((c) => c.school_id).filter(Boolean))] as string[];
  const institutionMap = new Map<string, { id: string; name: string }>();
  if (schoolIds.length > 0) {
    const { data: institutions } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', schoolIds);
    (institutions ?? []).forEach((i) => institutionMap.set(i.id, i));
  }
  const list: CommunityV2WithInstitution[] = rawList.map((c) => ({
    ...c,
    institution: c.school_id ? institutionMap.get(c.school_id) ?? null : null,
  }));
  const joinable = list.filter((c) => !inIds.has(c.id));
  return joinable;
}

export async function getCommunityById(id: string): Promise<CommunityV2WithInstitution | null> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from(COMMUNITIES_V2)
    .select(`*, institution:institutions(id, name)`)
    .eq('id', id)
    .single();
  return data as CommunityV2WithInstitution | null;
}

/** Fetch community by id with the given client (e.g. service role) to bypass RLS. */
export async function getCommunityByIdWithClient(
  supabase: SupabaseClient,
  id: string
): Promise<CommunityV2WithInstitution | null> {
  const { data: community, error } = await supabase
    .from(COMMUNITIES_V2)
    .select('*')
    .eq('id', id)
    .single();
  if (error || !community) return null;
  if (!community.school_id) {
    return { ...community, institution: null } as CommunityV2WithInstitution;
  }
  const { data: institution } = await supabase
    .from('institutions')
    .select('id, name')
    .eq('id', community.school_id)
    .single();
  return { ...community, institution: institution ?? null } as CommunityV2WithInstitution;
}

/** Fetch current user's membership with the given client (e.g. service role) to bypass RLS. */
export async function getMyMembershipWithClient(
  supabase: SupabaseClient,
  userId: string,
  communityId: string
): Promise<CommunityMembershipV2 | null> {
  const { data } = await supabase
    .from(MEMBERSHIPS_V2)
    .select('*')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .single();
  return data as CommunityMembershipV2 | null;
}

export async function getCommunityMembers(communityId: string): Promise<CommunityMembershipV2WithProfile[]> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from(MEMBERSHIPS_V2)
    .select(`
      *,
      profile:profiles(id, full_name, username, avatar_url)
    `)
    .eq('community_id', communityId)
    .eq('status', 'ACTIVE')
    .order('joined_at');
  return (data as CommunityMembershipV2WithProfile[]) ?? [];
}

/** Fetch community members with the given client (e.g. service role) to bypass RLS. */
export async function getCommunityMembersWithClient(
  supabase: SupabaseClient,
  communityId: string
): Promise<CommunityMembershipV2WithProfile[]> {
  const { data: memberships } = await supabase
    .from(MEMBERSHIPS_V2)
    .select('*')
    .eq('community_id', communityId)
    .eq('status', 'ACTIVE')
    .order('joined_at');

  if (!memberships?.length) return [];

  const userIds = memberships.map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url, role')
    .in('id', userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  return memberships.map((m) => ({
    ...m,
    profile: profileMap.get(m.user_id) ?? null,
  })) as CommunityMembershipV2WithProfile[];
}

export async function getCommunityMessages(
  communityId: string,
  opts?: { limit?: number; before?: string }
): Promise<CommunityMessageV2WithAuthor[]> {
  const supabase = await getServerClient();
  let q = supabase
    .from(MESSAGES_V2)
    .select(`
      *,
      author:profiles(id, full_name, username, avatar_url)
    `)
    .eq('community_id', communityId)
    .is('parent_message_id', null)
    .order('created_at', { ascending: false });
  if (opts?.limit) q = q.limit(opts.limit);
  if (opts?.before) q = q.lt('created_at', opts.before);
  const { data } = await q;
  return (data as CommunityMessageV2WithAuthor[]) ?? [];
}

export async function getThreadReplies(parentMessageId: string): Promise<CommunityMessageV2WithAuthor[]> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from(MESSAGES_V2)
    .select(`
      *,
      author:profiles(id, full_name, username, avatar_url)
    `)
    .eq('parent_message_id', parentMessageId)
    .order('created_at', { ascending: true });
  return (data as CommunityMessageV2WithAuthor[]) ?? [];
}

export async function getPinnedMessages(communityId: string): Promise<CommunityMessageV2WithAuthor[]> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from(MESSAGES_V2)
    .select(`
      *,
      author:profiles(id, full_name, username, avatar_url)
    `)
    .eq('community_id', communityId)
    .eq('is_pinned', true)
    .is('parent_message_id', null)
    .order('created_at', { ascending: false });
  return (data as CommunityMessageV2WithAuthor[]) ?? [];
}

export async function getUserFavoritesInCommunity(
  communityId: string
): Promise<(CommunityMessageV2WithAuthor & { favorite_id: string })[]> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: favs } = await supabase
    .from(FAVORITES_V2)
    .select('id, message_id')
    .eq('user_id', user.id);
  if (!favs?.length) return [];

  const msgIds = favs.map((f) => f.message_id);
  const { data: messages } = await supabase
    .from(MESSAGES_V2)
    .select(`*, author:profiles(id, full_name, username, avatar_url)`)
    .eq('community_id', communityId)
    .in('id', msgIds)
    .order('created_at', { ascending: false });

  const byId = new Map(favs.map((f) => [f.message_id, f.id]));
  return ((messages ?? []) as CommunityMessageV2WithAuthor[]).map((m) => ({
    ...m,
    favorite_id: byId.get(m.id) ?? '',
  }));
}

export async function getMyMembership(communityId: string): Promise<CommunityMembershipV2 | null> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from(MEMBERSHIPS_V2)
    .select('*')
    .eq('community_id', communityId)
    .eq('user_id', user.id)
    .single();
  return data as CommunityMembershipV2 | null;
}

export async function joinCommunity(communityId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase.from(MEMBERSHIPS_V2).upsert(
    {
      community_id: communityId,
      user_id: user.id,
      role: 'MEMBER',
      status: 'ACTIVE',
      left_at: null,
      joined_at: new Date().toISOString(),
    },
    { onConflict: 'community_id,user_id' }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function leaveCommunity(communityId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase
    .from(MEMBERSHIPS_V2)
    .update({ status: 'LEFT', left_at: new Date().toISOString() })
    .eq('community_id', communityId)
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setMute(
  communityId: string,
  muted: boolean,
  mutedUntil?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase
    .from(MEMBERSHIPS_V2)
    .update({ muted, muted_until: mutedUntil ?? null })
    .eq('community_id', communityId)
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createCommunity(params: {
  name: string;
  description?: string;
  avatar_url?: string;
}): Promise<{ ok: boolean; communityId?: string; error?: string }> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data: community, error: insertError } = await supabase
    .from(COMMUNITIES_V2)
    .insert({
      type: 'PUBLIC',
      school_id: null,
      name: params.name,
      description: params.description ?? null,
      avatar_url: params.avatar_url ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (insertError) return { ok: false, error: insertError.message };
  if (!community) return { ok: false, error: 'Insert failed' };

  const { error: memError } = await supabase.from(MEMBERSHIPS_V2).insert({
    community_id: community.id,
    user_id: user.id,
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  if (memError) return { ok: false, error: memError.message };
  return { ok: true, communityId: community.id };
}

export async function postMessage(params: {
  communityId: string;
  content: string;
  parentMessageId?: string | null;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data: msg, error } = await supabase
    .from(MESSAGES_V2)
    .insert({
      community_id: params.communityId,
      user_id: user.id,
      parent_message_id: params.parentMessageId ?? null,
      content: params.content,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, messageId: msg?.id };
}

export async function deleteMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase
    .from(MESSAGES_V2)
    .delete()
    .eq('id', messageId)
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function pinMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getServerClient();
  const { error } = await supabase
    .from(MESSAGES_V2)
    .update({ is_pinned: true })
    .eq('id', messageId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unpinMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getServerClient();
  const { error } = await supabase
    .from(MESSAGES_V2)
    .update({ is_pinned: false })
    .eq('id', messageId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function addFavorite(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase.from(FAVORITES_V2).insert({ user_id: user.id, message_id: messageId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeFavorite(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase
    .from(FAVORITES_V2)
    .delete()
    .eq('user_id', user.id)
    .eq('message_id', messageId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateCommunityAvatar(
  communityId: string,
  avatarUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getServerClient();
  const { error } = await supabase
    .from(COMMUNITIES_V2)
    .update({ avatar_url: avatarUrl })
    .eq('id', communityId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
