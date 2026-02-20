// =====================================================
// COMMUNITIES V2 UNIFIED TYPES (Discord-style)
// =====================================================

export type CommunityTypeV2 = 'SCHOOL' | 'PUBLIC';
export type CommunityMemberRoleV2 = 'MEMBER' | 'ADMIN';
export type CommunityMemberStatusV2 = 'ACTIVE' | 'LEFT';

export interface CommunityV2 {
  id: string;
  type: CommunityTypeV2;
  school_id: string | null;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CommunityMembershipV2 {
  id: string;
  community_id: string;
  user_id: string;
  role: CommunityMemberRoleV2;
  status: CommunityMemberStatusV2;
  muted: boolean;
  muted_until: string | null;
  joined_at: string;
  left_at: string | null;
}

export type CommunityMessageAttachmentType = 'image' | 'file' | 'voice';

export interface CommunityMessageV2 {
  id: string;
  community_id: string;
  user_id: string;
  parent_message_id: string | null;
  content: string;
  attachment_url?: string | null;
  attachment_type?: CommunityMessageAttachmentType | null;
  attachment_name?: string | null;
  is_pinned: boolean;
  created_at: string;
}

export interface CommunityFavoriteV2 {
  id: string;
  user_id: string;
  message_id: string;
  created_at: string;
}

export interface CommunityV2WithInstitution extends CommunityV2 {
  institution?: { id: string; name: string } | null;
}

export interface CommunityMessageV2WithAuthor extends CommunityMessageV2 {
  author?: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null;
}

export interface CommunityMembershipV2WithProfile extends CommunityMembershipV2 {
  profile?: {
    id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
    role?: string | null;
  } | null;
}
