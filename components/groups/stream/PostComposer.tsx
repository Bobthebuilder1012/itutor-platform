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

const TYPE_PILLS: { value: StreamPostType; label: string; icon: React.ReactNode; tip: string; tutorOnly: boolean }[] = [
  {
    value: 'announcement',
    label: 'Announcement',
    tip: 'Bold, pinnable. Students can react but replies are limited.',
    tutorOnly: true,
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>,
  },
  {
    value: 'discussion',
    label: 'Discussion',
    tip: 'Opens a full thread. Students can reply freely.',
    tutorOnly: false,
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>,
  },
  {
    value: 'content',
    label: 'Learning Content',
    tip: 'Share files, links, or study materials with your class.',
    tutorOnly: true,
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  },
  {
    value: 'assignment',
    label: 'Assignment',
    tip: 'Set a graded assignment. Students upload their papers directly.',
    tutorOnly: true,
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  },
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
  const [marksAvailable, setMarksAvailable] = useState<number | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const visiblePills = TYPE_PILLS.filter((p) => isTutor || !p.tutorOnly);

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
        file_url: '',
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
    if (postType === 'assignment' && (!marksAvailable || Number(marksAvailable) < 1)) {
      setError('Marks available is required for assignments.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      let attachmentUrls: CreateStreamPostInput['attachment_urls'] = [];
      const pending = attachments ?? [];
      const withFile = pending.filter((a) => (a as { _file?: File })._file) as Array<{
        file_name: string; file_url: string; file_type?: string; file_size_bytes?: number; _file: File;
      }>;
      const alreadyUploaded = pending.filter((a) => !(a as { _file?: File })._file) as Array<{
        file_name: string; file_url: string; file_type?: string; file_size_bytes?: number;
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
        ...(postType === 'assignment' && {
          marks_available: Number(marksAvailable),
          due_date: dueDate || undefined,
        }),
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
      setMarksAvailable('');
      setDueDate('');
      setPostType(isTutor ? 'announcement' : 'discussion');
      onPosted();
    } catch {
      setError('Could not post. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[18px] mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <form onSubmit={handleSubmit}>
        {/* Top: avatar + type pills */}
        <div className="flex items-center gap-3 mb-3">
          {authorAvatarUrl ? (
            <img src={authorAvatarUrl} alt={authorName} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#0d9668] text-white flex items-center justify-center text-[12px] font-bold flex-shrink-0">
              {getInitials(authorName)}
            </div>
          )}
          <div className="flex gap-[5px] flex-wrap">
            {visiblePills.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPostType(p.value)}
                className={`group relative flex items-center gap-[5px] px-3.5 py-[6px] rounded-[20px] text-[12px] font-semibold border-[1.5px] transition-colors ${
                  postType === p.value
                    ? 'border-[#0d9668] bg-[#d1fae5] text-[#047857]'
                    : 'border-[#e4e8ee] bg-white text-[#6b7280] hover:border-[#0d9668] hover:text-[#0d9668]'
                }`}
              >
                {p.icon}
                {p.label}
                <span className="hidden group-hover:block absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-[#111827] text-white px-2.5 py-1.5 rounded-md text-[10px] font-medium whitespace-nowrap z-10 after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-[5px] after:border-transparent after:border-t-[#111827]">
                  {p.tip}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Textarea */}
        <textarea
          value={messageBody}
          onChange={(e) => setMessageBody(e.target.value)}
          placeholder={postType === 'assignment' ? 'Describe the assignment instructions...' : 'Share an announcement, start a discussion, or post learning content...'}
          rows={3}
          disabled={submitting}
          className="w-full resize-y min-h-[72px] border border-[#e4e8ee] rounded-[10px] px-3.5 py-2.5 text-[13.5px] leading-[1.5] focus:outline-none focus:border-[#0d9668] focus:shadow-[0_0_0_3px_#d1fae5] disabled:opacity-50 placeholder:text-[#9ca3af] transition-all"
        />

        {/* Assignment extra fields */}
        {postType === 'assignment' && (
          <div className="mt-3 flex flex-col sm:flex-row gap-3 p-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[10px]">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-[#047857] mb-1">Marks available *</label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 30"
                value={marksAvailable}
                onChange={(e) => setMarksAvailable(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={submitting}
                className="w-full border border-[#e4e8ee] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#0d9668] focus:shadow-[0_0_0_3px_#d1fae5] disabled:opacity-50"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-[#047857] mb-1">Due date (optional)</label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={submitting}
                className="w-full border border-[#e4e8ee] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#0d9668] focus:shadow-[0_0_0_3px_#d1fae5] disabled:opacity-50"
              />
            </div>
          </div>
        )}

        {/* Attachment list */}
        {attachments && attachments.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mt-2">
            {attachments.map((a, i) => (
              <li key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 bg-[#f5f7fa] text-xs">
                <span className="truncate max-w-[140px]">{a.file_name}</span>
                <button type="button" onClick={() => removeAttachment(i)} className="text-gray-400 hover:text-red-500" aria-label="Remove">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Bottom bar: tools + post */}
        <div className="flex justify-between items-center mt-2.5">
          <div className="flex gap-[2px]">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || (attachments?.length ?? 0) >= MAX_FILES}
              className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#6b7280] hover:bg-[#f5f7fa] hover:text-[#0d9668] transition-colors disabled:opacity-40"
              title="Attach file"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#6b7280]">
              {isTutor ? 'Announcements and content are tutor-only.' : 'Students can post discussions.'}
            </span>
            <button
              type="submit"
              disabled={submitting || (!messageBody.trim() && !(attachments?.length)) || (postType === 'assignment' && (!marksAvailable || Number(marksAvailable) < 1))}
              className="px-6 py-[9px] bg-[#0d9668] hover:bg-[#047857] disabled:opacity-35 disabled:cursor-not-allowed text-white rounded-[10px] text-[13px] font-semibold transition-colors"
            >
              {submitting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>

        {error && <p className="text-[11px] text-[#ef4444] mt-2">{error}</p>}
      </form>
    </div>
  );
}
