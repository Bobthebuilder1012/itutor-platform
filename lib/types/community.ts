// =====================================================
// COMMUNITY TYPES
// =====================================================
// Type definitions for the iTutor community system

// Enums matching database types
export type CommunityType = 'school' | 'school_form' | 'subject_qa';
export type CommunityAudience = 'students' | 'itutors' | 'mixed';
export type MemberRole = 'member' | 'moderator' | 'admin';
export type MemberStatus = 'active' | 'restricted' | 'timed_out' | 'banned';
export type QuestionStatus = 'open' | 'answered' | 'locked';
export type MessageType = 'dm' | 'question' | 'answer';
export type ConversationType = 'dm' | 'booking' | 'group';
export type ReportTargetType = 'question' | 'answer';
export type ReportReason = 
  | 'spam' 
  | 'harassment' 
  | 'inappropriate' 
  | 'off_platform_payments' 
  | 'misinformation' 
  | 'other';
export type ModActionType = 
  | 'restrict_user'
  | 'timeout_user'
  | 'ban_user'
  | 'unban_user'
  | 'remove_question'
  | 'remove_answer'
  | 'lock_question'
  | 'unlock_question'
  | 'pin_question'
  | 'unpin_question'
  | 'mark_best_answer'
  | 'update_community_profile';

// Core Community Interface
export interface Community {
  id: string;
  name: string;
  type: CommunityType;
  audience: CommunityAudience;
  institution_id?: string;
  form_level?: string;
  subject_id?: string;
  level_tag?: string;
  is_auto: boolean;
  is_joinable: boolean;
  description?: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
  member_count?: number;
  // Populated via joins
  institution?: {
    id: string;
    name: string;
  };
  subject?: {
    id: string;
    name: string;
  };
}

// Community Membership
export interface CommunityMembership {
  id: string;
  community_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  timed_out_until?: string;
  joined_at: string;
  // Populated via joins
  community?: Community;
  user?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string;
    role: string;
  };
}

// Question (stored in messages table)
export interface Question {
  id: string;
  community_id: string;
  author_id: string;
  title: string;
  body: string;
  subject_id?: string;
  level_tag?: string;
  topic_tag?: string;
  status: QuestionStatus;
  best_answer_id?: string;
  answer_count: number;
  views_count: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  // Populated via joins
  author?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string;
    role: string;
    institution_id?: string;
  };
  community?: Community;
  best_answer?: Answer;
}

// Answer (stored in messages table)
export interface Answer {
  id: string;
  question_id: string;
  author_id: string;
  body: string;
  is_best: boolean;
  helpful_count: number;
  created_at: string;
  updated_at: string;
  // Populated via joins
  author?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string;
    role: string;
  };
}

// Community Report
export interface CommunityReport {
  id: string;
  reporter_id: string;
  community_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  details?: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  // Populated via joins
  reporter?: {
    id: string;
    full_name: string;
    username: string;
  };
  reviewer?: {
    id: string;
    full_name: string;
    username: string;
  };
}

// Moderator Action
export interface ModAction {
  id: string;
  community_id: string;
  moderator_id: string;
  action_type: ModActionType;
  target_user_id?: string;
  target_id?: string;
  reason?: string;
  metadata?: Record<string, any>;
  created_at: string;
  // Populated via joins
  moderator?: {
    id: string;
    full_name: string;
    username: string;
  };
  target_user?: {
    id: string;
    full_name: string;
    username: string;
  };
}

// Filter types for queries
export interface CommunityFilters {
  type?: CommunityType;
  audience?: CommunityAudience;
  subject_id?: string;
  level_tag?: string;
  is_joinable?: boolean;
  search?: string;
  user_id?: string; // For fetching user's communities
}

export interface QuestionFilters {
  status?: QuestionStatus;
  topic_tag?: string;
  author_institution_id?: string; // For "My School" filter
  is_pinned?: boolean;
  sort?: 'new' | 'top_today' | 'top_week' | 'unanswered';
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

// Create/Update DTOs
export interface CreateCommunityData {
  name: string;
  type: CommunityType;
  audience?: CommunityAudience;
  institution_id?: string;
  form_level?: string;
  subject_id?: string;
  level_tag?: string;
  description?: string;
  image_url?: string;
}

export interface UpdateCommunityData {
  name?: string;
  description?: string;
  image_url?: string;
}

export interface CreateQuestionData {
  community_id: string;
  title: string;
  body: string;
  topic_tag?: string;
  level_tag?: string;
  subject_id?: string;
}

export interface CreateAnswerData {
  question_id: string;
  body: string;
}

export interface CreateReportData {
  community_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  details?: string;
}

export interface ModerateUserData {
  community_id: string;
  user_id: string;
  action: 'restrict' | 'timeout' | 'ban' | 'unban';
  reason?: string;
  timeout_duration?: number; // in hours
}

// Rate limit response
export interface RateLimitInfo {
  allowed: boolean;
  remaining: number;
  limit: number;
  reset_at?: string;
}

// API Response types
export interface CommunityListResponse {
  communities: Community[];
  total: number;
  page: number;
  limit: number;
}

export interface QuestionListResponse {
  questions: Question[];
  total: number;
  page: number;
  limit: number;
}

export interface QuestionDetailResponse {
  question: Question;
  answers: Answer[];
  user_membership?: CommunityMembership;
}





