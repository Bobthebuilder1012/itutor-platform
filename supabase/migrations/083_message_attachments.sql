-- =====================================================
-- MESSAGE ATTACHMENTS: files, images, voice notes
-- =====================================================

-- 1) Direct messages (conversations)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

COMMENT ON COLUMN public.messages.attachment_url IS 'Storage URL for file/image/voice attachment';
COMMENT ON COLUMN public.messages.attachment_type IS 'image | file | voice';
COMMENT ON COLUMN public.messages.attachment_name IS 'Original filename for display/download';

-- Allow content to be empty when attachment is present
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_not_empty;
ALTER TABLE public.messages ADD CONSTRAINT messages_content_or_attachment CHECK (
  (content IS NOT NULL AND trim(content) != '') OR (attachment_url IS NOT NULL AND attachment_url != '')
);

-- 2) Community messages v2
ALTER TABLE public.community_messages_v2
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

COMMENT ON COLUMN public.community_messages_v2.attachment_url IS 'Storage URL for file/image/voice attachment';
COMMENT ON COLUMN public.community_messages_v2.attachment_type IS 'image | file | voice';
COMMENT ON COLUMN public.community_messages_v2.attachment_name IS 'Original filename for display/download';

-- Community messages: allow empty content when attachment present
ALTER TABLE public.community_messages_v2 ALTER COLUMN content DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_messages_v2_content_or_attachment'
  ) THEN
    ALTER TABLE public.community_messages_v2 ADD CONSTRAINT community_messages_v2_content_or_attachment
    CHECK (
      (content IS NOT NULL AND trim(content) != '') OR (attachment_url IS NOT NULL AND attachment_url != '')
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3) Storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Upload: authenticated users to their own folder {user_id}/{path}
CREATE POLICY "message_attachments_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "message_attachments_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "message_attachments_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "message_attachments_select"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'message-attachments');
