import { supabase } from '@/lib/supabase/client';

const BUCKET = 'message-attachments';

export type AttachmentType = 'image' | 'file' | 'voice';

/**
 * Upload a file or blob to message-attachments bucket.
 * Path: {userId}/{uuid}_{sanitizedFilename}
 * Returns public URL for the stored file.
 */
export async function uploadMessageAttachment(
  userId: string,
  file: File | Blob,
  type: AttachmentType,
  fileName?: string
): Promise<{ url: string; name: string }> {
  const ext = file instanceof File ? (file.name.split('.').pop() || '') : 'webm';
  const name = fileName || (file instanceof File ? file.name : `voice-${Date.now()}.webm`);
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const path = `${userId}/${crypto.randomUUID()}_${sanitized}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file instanceof File ? file.type : 'audio/webm', upsert: false });

  if (error) throw error;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: urlData.publicUrl, name: name };
}
