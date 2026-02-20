'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { uploadMessageAttachment } from '@/lib/utils/messageAttachments';
import MessageInputBar from '@/components/MessageInputBar';

interface MessageComposerProps {
  communityId: string;
  parentMessageId?: string | null;
  onPosted?: () => void;
  placeholder?: string;
  className?: string;
}

export default function MessageComposer({
  communityId,
  parentMessageId = null,
  onPosted,
  placeholder = 'Write a message...',
  className = '',
}: MessageComposerProps) {
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [attachmentDraft, setAttachmentDraft] = useState<{ file?: File; voiceBlob?: Blob } | null>(null);

  const handleSubmit = async () => {
    const text = content.trim();
    const hasFile = attachmentDraft?.file;
    const hasVoice = attachmentDraft?.voiceBlob;
    if ((!text && !hasFile && !hasVoice) || posting) return;

    setPosting(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not signed in');
      setPosting(false);
      return;
    }

    let attachmentUrl: string | null = null;
    let attachmentType: 'image' | 'file' | 'voice' | null = null;
    let attachmentName: string | null = null;

    try {
      if (hasFile) {
        const f = attachmentDraft!.file!;
        const isImage = f.type.startsWith('image/');
        const res = await uploadMessageAttachment(user.id, f, isImage ? 'image' : 'file', f.name);
        attachmentUrl = res.url;
        attachmentType = isImage ? 'image' : 'file';
        attachmentName = res.name;
      } else if (hasVoice) {
        const res = await uploadMessageAttachment(user.id, attachmentDraft!.voiceBlob!, 'voice');
        attachmentUrl = res.url;
        attachmentType = 'voice';
        attachmentName = res.name;
      }

      const { error: insertError } = await supabase.from('community_messages_v2').insert({
        community_id: communityId,
        user_id: user.id,
        parent_message_id: parentMessageId,
        content: text || null,
        attachment_url: attachmentUrl || null,
        attachment_type: attachmentType || null,
        attachment_name: attachmentName || null,
      });

      if (insertError) {
        setError(insertError.message);
        setPosting(false);
        return;
      }
      setContent('');
      setAttachmentDraft(null);
      onPosted?.();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const sendWithVoiceBlob = async (blob: Blob) => {
    if (posting) return;
    setPosting(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not signed in');
      setPosting(false);
      return;
    }
    try {
      const res = await uploadMessageAttachment(user.id, blob, 'voice');
      const { error: insertError } = await supabase.from('community_messages_v2').insert({
        community_id: communityId,
        user_id: user.id,
        parent_message_id: parentMessageId,
        content: null,
        attachment_url: res.url,
        attachment_type: 'voice',
        attachment_name: res.name,
      });
      if (insertError) {
        setError(insertError.message);
        setPosting(false);
        return;
      }
      setAttachmentDraft(null);
      onPosted?.();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className={className}>
      <MessageInputBar
        value={content}
        onChange={setContent}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        disabled={false}
        sending={posting}
        onFileSelect={(file) => setAttachmentDraft((d) => ({ ...d, file, voiceBlob: undefined }))}
        onVoiceRecord={(blob) => setAttachmentDraft((d) => ({ ...d, voiceBlob: blob, file: undefined }))}
        onVoiceRecordAndSend={sendWithVoiceBlob}
        attachmentPreview={
          attachmentDraft?.file
            ? { name: attachmentDraft.file.name, type: attachmentDraft.file.type.startsWith('image/') ? 'image' : 'file' }
            : attachmentDraft?.voiceBlob
              ? { name: 'Voice note', type: 'voice' }
              : null
        }
        onClearAttachment={() => setAttachmentDraft(null)}
      />
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}
