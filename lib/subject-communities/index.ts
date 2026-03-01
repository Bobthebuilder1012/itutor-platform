import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SubjectCommunity,
  SubjectCommunityWithSchool,
  SubjectCommunityMembership,
  SubjectCommunityMessage,
  SubjectCommunityMessageWithSender,
  SubjectCommunityPinnedSession,
} from '@/lib/types/subject-communities';

const SUBJECT_COMMUNITIES = 'subject_communities';
const SUBJECT_MEMBERSHIPS = 'subject_community_memberships';
const SUBJECT_MESSAGES = 'subject_community_messages';

/** Form levels students can select at sign up (must match onboarding) */
export const FORM_LEVELS = ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Lower 6', 'Upper 6'] as const;

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

/** Get joinable subject communities for user's school and form level (for Join section) */
export async function getJoinableSubjectCommunities(
  supabase: SupabaseClient,
  userId: string,
  searchQuery?: string
): Promise<SubjectCommunityWithSchool[]> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('institution_id, form_level')
    .eq('id', userId)
    .single();
  const institutionId = profile?.institution_id;
  const formLevel = profile?.form_level?.trim() || null;
  if (!institutionId) return [];
  if (!formLevel) return [];

  const { data: joinedIds } = await supabase
    .from(SUBJECT_MEMBERSHIPS)
    .select('community_id')
    .eq('user_id', userId);
  const joinedSet = new Set((joinedIds ?? []).map((m) => m.community_id));

  let q = supabase
    .from(SUBJECT_COMMUNITIES)
    .select('*')
    .eq('school_id', institutionId)
    .eq('form_level', formLevel)
    .order('subject_name');

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

/** Ensure pre-made subject communities exist for an institution: every subject × every form level */
export async function ensureSubjectCommunitiesForSchool(
  supabase: SupabaseClient,
  institutionId: string
): Promise<{ created: number }> {
  const { data: subjects } = await supabase.from('subjects').select('name').limit(200);
  if (!subjects?.length) return { created: 0 };

  const subjectNames = [...new Set(subjects.map((s) => s.name))];
  let created = 0;
  for (const subject_name of subjectNames) {
    for (const form_level of FORM_LEVELS) {
      const { error } = await supabase.from(SUBJECT_COMMUNITIES).upsert(
        { school_id: institutionId, subject_name, form_level, member_count: 0 },
        { onConflict: 'school_id,subject_name,form_level', doNothing: true }
      );
      if (!error) created++;
    }
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

const PINNED_SESSIONS = 'subject_community_pinned_sessions';

/** Get pinned sessions for a community (not expired). Only members can see. */
export async function getPinnedSessionsForCommunity(
  supabase: SupabaseClient,
  communityId: string
): Promise<SubjectCommunityPinnedSession[]> {
  const { data: pinned } = await supabase
    .from(PINNED_SESSIONS)
    .select('id, community_id, session_id, created_at, expires_at')
    .eq('community_id', communityId)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true });
  if (!pinned?.length) return [];

  const sessionIds = pinned.map((p) => p.session_id);
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, scheduled_start_at, scheduled_end_at, join_url, tutor_id')
    .in('id', sessionIds);
  if (!sessions?.length) return pinned as SubjectCommunityPinnedSession[];

  const tutorIds = [...new Set(sessions.map((s) => s.tutor_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, username')
    .in('id', tutorIds);
  const tutorMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const sessionMap = new Map(sessions.map((s) => [s.id, { ...s, tutor: tutorMap.get(s.tutor_id) ?? null }]));
  return pinned.map((p) => ({
    ...p,
    session: sessionMap.get(p.session_id)
      ? {
          id: sessionMap.get(p.session_id)!.id,
          scheduled_start_at: sessionMap.get(p.session_id)!.scheduled_start_at,
          scheduled_end_at: sessionMap.get(p.session_id)!.scheduled_end_at,
          join_url: sessionMap.get(p.session_id)!.join_url,
          tutor_id: sessionMap.get(p.session_id)!.tutor_id,
          tutor: sessionMap.get(p.session_id)!.tutor
            ? { full_name: sessionMap.get(p.session_id)!.tutor!.full_name, username: sessionMap.get(p.session_id)!.tutor!.username }
            : undefined,
        }
      : undefined,
  })) as SubjectCommunityPinnedSession[];
}

/** Pin a session to a community and post system message (Phase 5: teacher accepts community session). */
export async function pinSessionToCommunity(
  supabase: SupabaseClient,
  communityId: string,
  sessionId: string,
  sessionEndAt: string
): Promise<{ ok: boolean; error?: string }> {
  const expiresAt = new Date(new Date(sessionEndAt).getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days after session end
  const { error: pinError } = await supabase.from(PINNED_SESSIONS).insert({
    community_id: communityId,
    session_id: sessionId,
    expires_at: expiresAt.toISOString(),
  });
  if (pinError) return { ok: false, error: pinError.message };
  const { error: msgError } = await postSystemMessage(supabase, communityId, 'A community session has been scheduled.');
  return msgError ? { ok: false, error: msgError.message } : { ok: true };
}
