'use client';

import { useRef, useState } from 'react';
import type { CreateStreamPostInput, StreamPostType } from '@/lib/types/groupStream';
import { uploadStreamAttachment } from '@/lib/utils/streamAttachments';
import { getInitials } from './timeAgo';

interface PostComposerProps {
  groupId: string;
  currentUserId: string;
  isTutor: boolean;
  authorName: string;
  authorAvatarUrl: string | null;
  onPosted: () => void;
}

const POST_TYPES: { value: StreamPostType; label: string }[] = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'content', label: 'Learning content' },
  { value: 'discussion', label: 'Discussion' },
];

const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 25;

export default function PostComposer({
  groupId,
  currentUserId,
  isTutor,
  authorName,
  authorAvatarUrl,
  onPosted,
}: PostComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messageBody, setMessageBody] = useState('');
  const [postType, setPostType] = useState<StreamPostType>(isTutor ? 'announcement' : 'discussion');
  const [attachments, setAttachments] = useState<CreateStreamPostInput['attachment_urls']>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const next: NonNullable<CreateStreamPostInput['attachment_urls']> = [...(attachments ?? [])];
    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    for (let i = 0; i < files.length && next.length < MAX_FILES; i++) {
      const file = files[i];
      if (file.size > maxBytes) continue;
      next.push({
        file_name: file.name,
        file_url: '', // will be set after upload
        file_type: file.type || undefined,
        file_size_bytes: file.size,
        _file: file,
      } as { file_name: string; file_url: string; file_type?: string; file_size_bytes?: number; _file?: File });
    }
    setAttachments(next);
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev?.filter((_, i) => i !== index) ?? []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageBody.trim() && !(attachments?.length)) return;
    setSubmitting(true);
    setError('');
    try {
      let attachmentUrls: CreateStreamPostInput['attachment_urls'] = [];
      const pending = attachments ?? [];
      const withFile = pending.filter((a) => (a as { _file?: File })._file) as Array<{
        file_name: string;
        file_url: string;
        file_type?: string;
        file_size_bytes?: number;
        _file: File;
      }>;
      const alreadyUploaded = pending.filter((a) => !(a as { _file?: File })._file) as Array<{
        file_name: string;
        file_url: string;
        file_type?: string;
        file_size_bytes?: number;
      }>;
      for (const a of withFile) {
        const up = await uploadStreamAttachment(currentUserId, groupId, a._file);
        attachmentUrls = [...(attachmentUrls ?? []), up];
      }
      attachmentUrls = [...(attachmentUrls ?? []), ...alreadyUploaded];

      const body: CreateStreamPostInput = {
        post_type: postType,
        message_body: messageBody.trim() || '.',
        attachment_urls: attachmentUrls.length ? attachmentUrls : undefined,
      };
      const res = await fetch(`/api/groups/${groupId}/stream/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? 'Could not post. Try again.');
        return;
      }
      setMessageBody('');
      setAttachments([]);
      onPosted();
    } catch {
      setError('Could not post. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-5 mb-6">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3 mb-3.5">
          {authorAvatarUrl ? (
            <img
              src={authorAvatarUrl}
              alt={authorName}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[13px] font-bold flex-shrink-0">
              {getInitials(authorName)}
            </div>
          )}
          {isTutor && (
            <select
              value={postType}
              onChange={(e) => setPostType(e.target.value as StreamPostType)}
              className="py-1.5 px-3 rounded-lg border border-[#e2e8f0] bg-[#f6f8fb] text-xs font-semibold text-gray-700 cursor-pointer focus:outline-none focus:border-emerald-500"
            >
              {POST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <textarea
          value={messageBody}
          onChange={(e) => setMessageBody(e.target.value)}
          placeholder={
            isTutor
              ? 'Share an announcement, learning content, or start a discussion...'
              : 'Share something with your class…'
          }
          rows={3}
          disabled={submitting}
          className="w-full resize-y min-h-[80px] border border-[#e2e8f0] rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50 placeholder:text-[#94a3b8]"
        />

        {attachments && attachments.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mt-2">
            {attachments.map((a, i) => (
              <li
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 bg-[#f6f8fb] text-xs"
              >
                <span className="truncate max-w-[140px]">{a.file_name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="text-gray-400 hover:text-red-500"
                  aria-label="Remove"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-between items-center mt-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting || (attachments?.length ?? 0) >= MAX_FILES}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-500 hover:underline bg-transparent border-none p-0 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49" />
            </svg>
            Add attachment
            {attachments && attachments.length > 0 && (
              <span className="text-gray-400 font-normal ml-1">
                ({attachments.length}/{MAX_FILES})
              </span>
            )}
          </button>
          <button
            type="submit"
            disabled={submitting || (!messageBody.trim() && !(attachments?.length))}
            className="px-7 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer"
          >
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </div>

        {error ? (
          <p className="text-[11px] text-red-500 mt-2">{error}</p>
        ) : (
          <p className="text-[11px] text-[#64748b] mt-2">
            {isTutor ? 'Announcements and content are tutor-only.' : 'Students can post discussions.'}
          </p>
        )}
      </form>
    </div>
  );
}
