// =====================================================
// COMMUNITY DATA ACCESS LAYER
// =====================================================
// Type-safe functions for interacting with community system

import { supabase } from './client';
import type {
  Community,
  CommunityMembership,
  Question,
  Answer,
  CommunityReport,
  ModAction,
  CommunityFilters,
  QuestionFilters,
  PaginationParams,
  CreateCommunityData,
  UpdateCommunityData,
  CreateQuestionData,
  CreateAnswerData,
  CreateReportData,
  ModerateUserData,
  CommunityListResponse,
  QuestionListResponse,
  QuestionDetailResponse,
} from '@/lib/types/community';

// =====================================================
// COMMUNITIES
// =====================================================

export async function getCommunities(
  filters: CommunityFilters = {},
  pagination: PaginationParams = {}
): Promise<CommunityListResponse> {
  const { page = 1, limit = 20 } = pagination;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('communities')
    .select(`
      *,
      institution:institutions(id, name),
      subject:subjects(id, name)
    `, { count: 'exact' });

  // Apply filters
  if (filters.type) {
    query = query.eq('type', filters.type);
  }
  if (filters.audience) {
    query = query.eq('audience', filters.audience);
  }
  if (filters.subject_id) {
    query = query.eq('subject_id', filters.subject_id);
  }
  if (filters.level_tag) {
    query = query.eq('level_tag', filters.level_tag);
  }
  if (filters.is_joinable !== undefined) {
    query = query.eq('is_joinable', filters.is_joinable);
  }
  if (filters.search) {
    query = query.ilike('name', `%${filters.search}%`);
  }

  // If user_id provided, filter to communities they're in
  if (filters.user_id) {
    // First get the community IDs for this user
    const { data: memberships, error: membershipError } = await supabase
      .from('community_memberships')
      .select('community_id')
      .eq('user_id', filters.user_id)
      .eq('status', 'active');
    
    if (membershipError) throw membershipError;
    
    const communityIds = memberships?.map(m => m.community_id) || [];
    
    // If user has no memberships, return empty result
    if (communityIds.length === 0) {
      return {
        communities: [],
        total: 0,
        page,
        limit,
      };
    }
    
    // Filter to only these communities
    query = query.in('id', communityIds);
  }

  query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    communities: data || [],
    total: count || 0,
    page,
    limit,
  };
}

export async function getCommunityById(id: string): Promise<Community | null> {
  const { data, error } = await supabase
    .from('communities')
    .select(`
      *,
      institution:institutions(id, name),
      subject:subjects(id, name)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createCommunity(communityData: CreateCommunityData): Promise<Community> {
  const { data, error } = await supabase
    .from('communities')
    .insert(communityData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCommunity(
  id: string,
  updates: UpdateCommunityData
): Promise<Community> {
  const { data, error } = await supabase
    .from('communities')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getMemberCount(communityId: string): Promise<number> {
  const { count, error } = await supabase
    .from('community_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('community_id', communityId)
    .eq('status', 'active');

  if (error) throw error;
  return count || 0;
}

// =====================================================
// MEMBERSHIPS
// =====================================================

export async function getUserMemberships(userId: string): Promise<CommunityMembership[]> {
  const { data, error } = await supabase
    .from('community_memberships')
    .select(`
      *,
      community:communities(
        *,
        institution:institutions(id, name),
        subject:subjects(id, name)
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getCommunityMembers(
  communityId: string,
  pagination: PaginationParams = {}
): Promise<CommunityMembership[]> {
  const { page = 1, limit = 50 } = pagination;
  const offset = (page - 1) * limit;

  const { data, error } = await supabase
    .from('community_memberships')
    .select(`
      *,
      user:profiles(id, full_name, username, avatar_url, role)
    `)
    .eq('community_id', communityId)
    .range(offset, offset + limit - 1)
    .order('joined_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getUserMembership(
  communityId: string,
  userId: string
): Promise<CommunityMembership | null> {
  const { data, error } = await supabase
    .from('community_memberships')
    .select('*')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function joinCommunity(
  communityId: string,
  userId: string
): Promise<CommunityMembership> {
  const { data, error } = await supabase
    .from('community_memberships')
    .insert({
      community_id: communityId,
      user_id: userId,
      role: 'member',
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function leaveCommunity(communityId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('community_memberships')
    .delete()
    .eq('community_id', communityId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function updateMembershipStatus(
  membershipId: string,
  status: CommunityMembership['status'],
  timedOutUntil?: string
): Promise<CommunityMembership> {
  const updates: any = { status };
  if (timedOutUntil) {
    updates.timed_out_until = timedOutUntil;
  }

  const { data, error } = await supabase
    .from('community_memberships')
    .update(updates)
    .eq('id', membershipId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMembershipRole(
  membershipId: string,
  role: CommunityMembership['role']
): Promise<CommunityMembership> {
  const { data, error } = await supabase
    .from('community_memberships')
    .update({ role })
    .eq('id', membershipId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// =====================================================
// QUESTIONS & ANSWERS
// =====================================================

export async function getQuestions(
  communityId: string,
  filters: QuestionFilters = {},
  pagination: PaginationParams = {}
): Promise<QuestionListResponse> {
  const { page = 1, limit = 50 } = pagination;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('messages')
    .select(`
      *,
      author:profiles!messages_sender_id_fkey(id, full_name, username, avatar_url, role, institution_id)
    `, { count: 'exact' })
    .eq('community_id', communityId)
    .eq('message_type', 'question');

  // Apply filters
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.topic_tag) {
    query = query.eq('topic_tag', filters.topic_tag);
  }
  if (filters.author_institution_id) {
    query = query.eq('author.institution_id', filters.author_institution_id);
  }
  if (filters.is_pinned !== undefined) {
    query = query.eq('is_pinned', filters.is_pinned);
  }

  // Sorting
  if (filters.sort === 'unanswered') {
    query = query.eq('answer_count', 0).order('created_at', { ascending: false });
  } else if (filters.sort === 'top_today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    query = query
      .gte('created_at', today.toISOString())
      .order('answer_count', { ascending: false })
      .order('helpful_count', { ascending: false });
  } else if (filters.sort === 'top_week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    query = query
      .gte('created_at', weekAgo.toISOString())
      .order('answer_count', { ascending: false })
      .order('helpful_count', { ascending: false });
  } else {
    // Default: new (pinned first, then by created_at)
    query = query
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    questions: data || [],
    total: count || 0,
    page,
    limit,
  };
}

export async function getQuestionById(questionId: string): Promise<QuestionDetailResponse | null> {
  // Get question
  const { data: question, error: questionError } = await supabase
    .from('messages')
    .select(`
      *,
      author:profiles!messages_sender_id_fkey(id, full_name, username, avatar_url, role, institution_id),
      community:communities(*)
    `)
    .eq('id', questionId)
    .eq('message_type', 'question')
    .single();

  if (questionError) throw questionError;
  if (!question) return null;

  // Get answers
  const { data: answers, error: answersError } = await supabase
    .from('messages')
    .select(`
      *,
      author:profiles!messages_sender_id_fkey(id, full_name, username, avatar_url, role)
    `)
    .eq('question_id', questionId)
    .eq('message_type', 'answer')
    .order('is_best', { ascending: false })
    .order('created_at', { ascending: true });

  if (answersError) throw answersError;

  // Increment view count
  await supabase
    .from('messages')
    .update({ views_count: question.views_count + 1 })
    .eq('id', questionId);

  return {
    question,
    answers: answers || [],
  };
}

export async function createQuestion(questionData: CreateQuestionData): Promise<Question> {
  const { community_id, title, body, topic_tag, level_tag, subject_id } = questionData;

  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: session.session.user.id,
      message_type: 'question',
      community_id,
      title,
      content: body,
      topic_tag,
      level_tag,
      subject_id,
      status: 'open',
      answer_count: 0,
      views_count: 0,
      is_pinned: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createAnswer(answerData: CreateAnswerData): Promise<Answer> {
  const { question_id, body } = answerData;

  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    throw new Error('Not authenticated');
  }

  // Get the question's community_id
  const { data: question } = await supabase
    .from('messages')
    .select('community_id')
    .eq('id', question_id)
    .single();

  if (!question) throw new Error('Question not found');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: session.session.user.id,
      message_type: 'answer',
      question_id,
      community_id: question.community_id,
      content: body,
      is_best: false,
      helpful_count: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markBestAnswer(
  questionId: string,
  answerId: string
): Promise<void> {
  // Update question to set best_answer_id
  const { error } = await supabase
    .from('messages')
    .update({ best_answer_id: answerId })
    .eq('id', questionId);

  if (error) throw error;

  // Mark the answer as best
  await supabase
    .from('messages')
    .update({ is_best: true })
    .eq('id', answerId);

  // Unmark other answers
  await supabase
    .from('messages')
    .update({ is_best: false })
    .eq('question_id', questionId)
    .neq('id', answerId);
}

export async function pinQuestion(questionId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ is_pinned: true })
    .eq('id', questionId);

  if (error) throw error;
}

export async function unpinQuestion(questionId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ is_pinned: false })
    .eq('id', questionId);

  if (error) throw error;
}

export async function lockQuestion(questionId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ status: 'locked' })
    .eq('id', questionId);

  if (error) throw error;
}

export async function unlockQuestion(questionId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ status: 'open' })
    .eq('id', questionId);

  if (error) throw error;
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', questionId);

  if (error) throw error;
}

export async function deleteAnswer(answerId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', answerId);

  if (error) throw error;
}

// =====================================================
// REPORTS
// =====================================================

export async function createReport(reportData: CreateReportData): Promise<CommunityReport> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('community_reports')
    .insert({
      reporter_id: session.session.user.id,
      ...reportData,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getReports(
  communityId: string,
  status?: string
): Promise<CommunityReport[]> {
  let query = supabase
    .from('community_reports')
    .select(`
      *,
      reporter:profiles!community_reports_reporter_id_fkey(id, full_name, username),
      reviewer:profiles!community_reports_reviewed_by_fkey(id, full_name, username)
    `)
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function updateReportStatus(
  reportId: string,
  status: string,
  reviewerId: string
): Promise<void> {
  const { error } = await supabase
    .from('community_reports')
    .update({
      status,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', reportId);

  if (error) throw error;
}

// =====================================================
// MODERATION
// =====================================================

export async function moderateUser(data: ModerateUserData): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    throw new Error('Not authenticated');
  }

  const { community_id, user_id, action, reason, timeout_duration } = data;

  // Get the user's membership
  const membership = await getUserMembership(community_id, user_id);
  if (!membership) throw new Error('User is not a member of this community');

  let newStatus: CommunityMembership['status'];
  let timedOutUntil: string | undefined;

  switch (action) {
    case 'restrict':
      newStatus = 'restricted';
      break;
    case 'timeout':
      newStatus = 'timed_out';
      if (timeout_duration) {
        const until = new Date();
        until.setHours(until.getHours() + timeout_duration);
        timedOutUntil = until.toISOString();
      }
      break;
    case 'ban':
      newStatus = 'banned';
      break;
    case 'unban':
      newStatus = 'active';
      break;
    default:
      throw new Error('Invalid action');
  }

  // Update membership status
  await updateMembershipStatus(membership.id, newStatus, timedOutUntil);

  // Log moderation action
  await supabase.rpc('log_mod_action', {
    p_community_id: community_id,
    p_moderator_id: session.session.user.id,
    p_action_type: `${action}_user`,
    p_target_user_id: user_id,
    p_reason: reason,
    p_metadata: timeout_duration ? { timeout_hours: timeout_duration } : null,
  });
}

export async function getModActions(
  communityId: string,
  pagination: PaginationParams = {}
): Promise<ModAction[]> {
  const { page = 1, limit = 50 } = pagination;
  const offset = (page - 1) * limit;

  const { data, error } = await supabase
    .from('community_mod_actions')
    .select(`
      *,
      moderator:profiles!community_mod_actions_moderator_id_fkey(id, full_name, username),
      target_user:profiles!community_mod_actions_target_user_id_fkey(id, full_name, username)
    `)
    .eq('community_id', communityId)
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

