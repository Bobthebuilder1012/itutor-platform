export type StreamPostType = 'announcement' | 'content' | 'discussion' | 'assignment';
export type StreamAuthorRole = 'tutor' | 'student';

export interface StreamAttachment {
  id: string;
  post_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

export interface StreamPost {
  id: string;
  group_id: string;
  author_id: string;
  author_role: StreamAuthorRole;
  post_type: StreamPostType;
  message_body: string;
  marks_available: number | null;
  due_date: string | null;
  pinned_at: string | null;
  pin_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StreamReply {
  id: string;
  post_id: string;
  author_id: string;
  message_body: string;
  parent_reply_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StreamPostWithAuthor extends StreamPost {
  author: { id: string; full_name: string; avatar_url: string | null };
  attachments?: StreamAttachment[];
  replies?: StreamReplyWithAuthor[];
}

export interface StreamReplyWithAuthor extends StreamReply {
  author: { id: string; full_name: string; avatar_url: string | null };
  replies?: StreamReplyWithAuthor[];
}

export interface CreateStreamPostInput {
  post_type: StreamPostType;
  message_body: string;
  marks_available?: number;
  due_date?: string;
  attachment_urls?: { file_name: string; file_url: string; file_type?: string; file_size_bytes?: number }[];
}

export interface CreateStreamReplyInput {
  message_body: string;
}
