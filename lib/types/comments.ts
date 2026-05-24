export type CommentAuthor = {
  id: string;
  full_name: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type CommentReply = {
  id: string;
  target_type: string;
  target_id: string;
  author_id: string;
  body: string;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  author: CommentAuthor;
};

export type Comment = {
  id: string;
  author_id: string;
  body: string;
  stars: number | null;
  like_count: number;
  dislike_count: number;
  edited_at: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
  deleted_at: string | null;
  created_at: string;
  // class-specific
  class_id?: string;
  billing_period?: string;
  // tutor-specific
  tutor_id?: string;
  session_id?: string;
  // joined
  author: CommentAuthor;
  reply: CommentReply | null;
  user_reaction: 'like' | 'dislike' | null;
};

export type CommentTargetType = 'class_comment' | 'tutor_profile_comment';

export type EligibilityResponse = {
  canComment: boolean;
  canReact: boolean;
  availableBillingPeriod?: string;
  availableSessionIds?: string[];
  hasExistingComment: boolean;
};
