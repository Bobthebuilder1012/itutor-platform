import { supabase } from '@/lib/supabase/client';

const BUCKET = 'message-attachments';
const PREFIX = 'group-stream';

export interface StreamAttachmentUpload {
  file_name: string;
  file_url: string;
  file_type?: string;
  file_size_bytes?: number;
}

/**
 * Upload a file for a group stream post. Path: {userId}/{prefix}/{groupId}/{uuid}_{filename}.
 * Uses message-attachments bucket (first segment = userId satisfies RLS).
 */
export async function uploadStreamAttachment(
  userId: string,
  groupId: string,
  file: File
): Promise<StreamAttachmentUpload> {
  const ext = file.name.split('.').pop() || '';
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const path = `${userId}/${PREFIX}/${groupId}/${crypto.randomUUID()}_${sanitized}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (error) throw error;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    file_name: file.name,
    file_url: urlData.publicUrl,
    file_type: file.type || undefined,
    file_size_bytes: file.size,
  };
}
