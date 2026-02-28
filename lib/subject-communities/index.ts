import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SubjectCommunity,
  SubjectCommunityWithSchool,
  SubjectCommunityMembership,
  SubjectCommunityMessage,
  SubjectCommunityMessageWithSender,
} from '@/lib/types/subject-communities';

const SUBJECT_COMMUNITIES = 'subject_communities';
const SUBJECT_MEMBERSHIPS = 'subject_community_memberships';
const SUBJECT_MESSAGES = 'subject_community_messages';

/** Get school info + student count for School Community Header (no membership table) */
export async function getSchoolCommunityHeader(
  supabase: SupabaseClient,
  institutionId: string | null
): Promise<{ name: string; memberCount: number; description?: string } | null> {
  if (!institutionId) return null;
  const { data: institution } = await supabase
    .from('institutions')
    .select('id, name')
    .eq('id', institutionId)
    .single();
  if (!institution) return null;

  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('institution_id', institutionId);
  return {
    name: `${institution.name} Community`,
    memberCount: count ?? 0,
  };
}

/** Get user's joined subject communities (for My Communities) */
export async function getMySubjectCommunities(
  supabase: SupabaseClient,
  userId: string
): Promise<SubjectCommunityWithSchool[]> {
  const { data: memberships } = await supabase
    .from(SUBJECT_MEMBERSHIPS)
    .select('community_id')
    .eq('user_id', userId);
  if (!memberships?.length) return [];

  const ids = memberships.map((m) => m.community_id);
  const { data: communities } = await supabase
    .from(SUBJECT_COMMUNITIES)
    .select('*')
    .in('id', ids);
  if (!communities?.length) return [];

  const schoolIds = [...new Set(communities.map((c) => c.school_id))];
  const { data: institutions } = await supabase
    .from('institutions')
    .select('id, name')
    .in('id', schoolIds);
  const instMap = new Map((institutions ?? []).map((i) => [i.id, i]));

  return (communities as SubjectCommunity[]).map((c) => ({
    ...c,
    institution: instMap.get(c.school_id) ?? null,
  })) as SubjectCommunityWithSchool[];
}

/** Get joinable subject communities for user's school (for Join section) */
export async function getJoinableSubjectCommunities(
  supabase: SupabaseClient,
  userId: string,
  searchQuery?: string
): Promise<SubjectCommunityWithSchool[]> {
  const { data: profile } = await supabase.from('profiles').select('institution_id').eq('id', userId).single();
  const institutionId = profile?.institution_id;
  if (!institutionId) return [];

  const { data: joinedIds } = await supabase
    .from(SUBJECT_MEMBERSHIPS)
    .select('community_id')
    .eq('user_id', userId);
  const joinedSet = new Set((joinedIds ?? []).map((m) => m.community_id));

  let q = supabase
    .from(SUBJECT_COMMUNITIES)
    .select('*')
    .eq('school_id', institutionId)
    .order('subject_name')
    .order('form_level');

  if (searchQuery?.trim()) {
    const term = searchQuery.trim();
    q = q.or(`subject_name.ilike.*${term}*,form_level.ilike.*${term}*`);
  }

  const { data: communities } = await q;
  const list = (communities ?? []) as SubjectCommunity[];
  const filtered = list.filter((c) => !joinedSet.has(c.id));

  const { data: institution } = await supabase.from('institutions').select('id, name').eq('id', institutionId).single();
  return filtered.map((c) => ({
    ...c,
    institution: institution ?? null,
  })) as SubjectCommunityWithSchool[];
}

/** Ensure subject communities exist for an institution (create from subjects table) */
export async function ensureSubjectCommunitiesForSchool(
  supabase: SupabaseClient,
  institutionId: string
): Promise<{ created: number }> {
  const { data: subjects } = await supabase.from('subjects').select('name, level').limit(200);
  if (!subjects?.length) return { created: 0 };

  const combos = new Map<string, { subject_name: string; form_level: string }>();
  for (const s of subjects) {
    const level = s.level || 'Form 4-5';
    combos.set(`${s.name}|${level}`, { subject_name: s.name, form_level: level });
  }
  let created = 0;
  for (const { subject_name, form_level } of combos.values()) {
    const { error } = await supabase.from(SUBJECT_COMMUNITIES).upsert(
      { school_id: institutionId, subject_name, form_level, member_count: 0 },
      { onConflict: 'school_id,subject_name,form_level', doNothing: true }
    );
    if (!error) created++;
  }
  return { created };
}

/** Join a subject community */
export async function joinSubjectCommunity(
  supabase: SupabaseClient,
  userId: string,
  communityId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: community } = await supabase.from(SUBJECT_COMMUNITIES).select('school_id').eq('id', communityId).single();
  if (!community) return { ok: false, error: 'Community not found' };

  const { data: profile } = await supabase.from('profiles').select('institution_id').eq('id', userId).single();
  if (profile?.institution_id !== community.school_id) return { ok: false, error: 'Cannot join communities from another school' };

  const { error } = await supabase.from(SUBJECT_MEMBERSHIPS).upsert(
    { user_id: userId, community_id: communityId },
    { onConflict: 'community_id,user_id' }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Get subject community by id */
export async function getSubjectCommunityById(
  supabase: SupabaseClient,
  id: string
): Promise<SubjectCommunityWithSchool | null> {
  const { data: c } = await supabase.from(SUBJECT_COMMUNITIES).select('*').eq('id', id).single();
  if (!c) return null;
  const { data: inst } = await supabase.from('institutions').select('id, name').eq('id', c.school_id).single();
  return { ...c, institution: inst ?? null } as SubjectCommunityWithSchool;
}

/** Get user's membership in a subject community */
export async function getSubjectCommunityMembership(
  supabase: SupabaseClient,
  userId: string,
  communityId: string
): Promise<SubjectCommunityMembership | null> {
  const { data } = await supabase
    .from(SUBJECT_MEMBERSHIPS)
    .select('*')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .single();
  return data as SubjectCommunityMembership | null;
}

/** Get members of a subject community */
export async function getSubjectCommunityMembers(
  supabase: SupabaseClient,
  communityId: string
): Promise<{ id: string; full_name: string | null; username: string | null }[]> {
  const { data: memberships } = await supabase
    .from(SUBJECT_MEMBERSHIPS)
    .select('user_id')
    .eq('community_id', communityId);
  if (!memberships?.length) return [];
  const ids = memberships.map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, username')
    .in('id', ids);
  return (profiles ?? []).map((p) => ({ id: p.id, full_name: p.full_name, username: p.username }));
}

/** Get messages for a subject community (lazy load) */
export async function getSubjectCommunityMessages(
  supabase: SupabaseClient,
  communityId: string,
  opts?: { limit?: number; before?: string }
): Promise<SubjectCommunityMessageWithSender[]> {
  let q = supabase
    .from(SUBJECT_MESSAGES)
    .select(`*, sender:profiles(id, full_name, username)`)
    .eq('community_id', communityId)
    .order('created_at', { ascending: true });
  if (opts?.limit) q = q.limit(opts.limit);
  if (opts?.before) q = q.lt('created_at', opts.before);
  const { data } = await q;
  return (data ?? []) as SubjectCommunityMessageWithSender[];
}

/** Post a message */
export async function postSubjectCommunityMessage(
  supabase: SupabaseClient,
  userId: string,
  communityId: string,
  messageText: string,
  messageType: 'student' | 'system' | 'pinned' = 'student'
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const { data: msg, error } = await supabase
    .from(SUBJECT_MESSAGES)
    .insert({
      community_id: communityId,
      sender_id: messageType === 'system' ? null : userId,
      message_text: messageText,
      message_type: messageType,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, messageId: msg?.id };
}

/** Create system message (e.g. "John joined the community") */
export async function postSystemMessage(
  supabase: SupabaseClient,
  communityId: string,
  messageText: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from(SUBJECT_MESSAGES).insert({
    community_id: communityId,
    sender_id: null,
    message_text: messageText,
    message_type: 'system',
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
