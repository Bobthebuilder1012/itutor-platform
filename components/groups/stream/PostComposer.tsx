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
    <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/80">
      <div className="flex gap-3">
        {authorAvatarUrl ? (
          <img
            src={authorAvatarUrl}
            alt={authorName}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-sm font-bold flex-shrink-0">
            {getInitials(authorName)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-emerald-800 mb-2">Create a post</p>
          <form onSubmit={handleSubmit} className="space-y-2">
            {isTutor && (
              <select
                value={postType}
                onChange={(e) => setPostType(e.target.value as StreamPostType)}
                className="text-xs border border-emerald-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {POST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder={
                isTutor
                  ? 'Share an announcement, learning content, or start a discussion…'
                  : 'Share something with your group…'
              }
              rows={3}
              disabled={submitting}
              className="w-full resize-none border border-emerald-200 bg-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={submitting || (attachments?.length ?? 0) >= MAX_FILES}
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  Add attachment
                </button>
                {attachments && attachments.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {attachments.length} file{attachments.length !== 1 ? 's' : ''} (max {MAX_FILES}, {MAX_FILE_SIZE_MB}MB each)
                  </span>
                )}
              </div>
              {attachments && attachments.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {attachments.map((a, i) => (
                    <li
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs"
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
            </div>
            <div className="flex items-center justify-between">
              {error ? (
                <p className="text-xs text-red-500">{error}</p>
              ) : (
                <span className="text-xs text-gray-400">
                  {isTutor ? 'Announcements and content are tutor-only.' : 'Students can post discussions.'}
                </span>
              )}
              <button
                type="submit"
                disabled={submitting || (!messageBody.trim() && !(attachments?.length))}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {submitting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
