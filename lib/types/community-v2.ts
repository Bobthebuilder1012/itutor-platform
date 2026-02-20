// =====================================================
// SCHOOL COMMUNITIES V2 - TYPES
// =====================================================

export type SchoolCommunityMemberStatus = 'ACTIVE' | 'LEFT';
export type SchoolCommunityMemberRole = 'MEMBER' | 'ADMIN';

export interface SchoolCommunity {
  id: string;
  school_id: string;
  name: string;
  description: string | null;
  type: string;
  created_at: string;
}

export interface SchoolCommunityWithSchool extends SchoolCommunity {
  school?: { id: string; name: string } | null;
}

export interface SchoolCommunityMembership {
  id: string;
  community_id: string;
  user_id: string;
  status: SchoolCommunityMemberStatus;
  muted: boolean;
  role: SchoolCommunityMemberRole;
  joined_at: string;
  left_at: string | null;
}

export interface SchoolCommunityMessage {
  id: string;
  community_id: string;
  user_id: string;
  parent_message_id: string | null;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface SchoolCommunityMessageWithAuthor extends SchoolCommunityMessage {
  author?: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}
