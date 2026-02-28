// Subject communities - spec-compliant types

export interface SubjectCommunity {
  id: string;
  school_id: string;
  subject_name: string;
  form_level: string;
  member_count: number;
  description: string | null;
  created_at: string;
}

export interface SubjectCommunityWithSchool extends SubjectCommunity {
  institution?: { id: string; name: string } | null;
}

export interface SubjectCommunityMembership {
  id: string;
  user_id: string;
  community_id: string;
  joined_at: string;
}

export type SubjectCommunityMessageType = 'student' | 'system' | 'pinned';

export interface SubjectCommunityMessage {
  id: string;
  community_id: string;
  sender_id: string | null;
  message_text: string;
  message_type: SubjectCommunityMessageType;
  created_at: string;
}

export interface SubjectCommunityMessageWithSender extends SubjectCommunityMessage {
  sender?: { id: string; full_name: string | null; username: string | null } | null;
}
