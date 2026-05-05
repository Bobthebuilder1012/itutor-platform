'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import type { StreamPostWithAuthor } from '@/lib/types/groupStream';

interface UploadedFile {
  path: string;
  publicUrl: string;
  fileName: string;
  size: number;
}

interface Submission {
  id: string;
  status: 'pending' | 'graded';
  submitted_at: string;
  file_url: string | null;
  file_name: string | null;
  files: { url: string; name: string; size: number }[] | null;
  score: number | null;
  score_total: number | null;
  result: string | null;
  feedback: unknown | null;
}

type PanelState = 'empty' | 'queued' | 'submitted' | 'graded';

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

interface AssignmentDetailPageProps {
  lessonId: string;
  postId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar: string | null;
  isTutor: boolean;
}

export default function AssignmentDetailPage({
  lessonId,
  postId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  isTutor,
}: AssignmentDetailPageProps) {
  const router = useRouter();

  const [post, setPost] = useState<StreamPostWithAuthor | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [subLoading, setSubLoading] = useState(true);

  // Your Work panel state
  const [queuedFiles, setQueuedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unsubmitting, setUnsubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [panelState, setPanelState] = useState<PanelState>('empty');

  // Comments
  const [classComment, setClassComment] = useState('');
  const [privateComment, setPrivateComment] = useState('');
  const [privateComments, setPrivateComments] = useState<{
    id: string;
    author_id: string;
    content: string;
    created_at: string;
    author: { id: string; full_name: string; avatar_url: string | null } | null;
  }[]>([]);
  const [sendingPrivate, setSendingPrivate] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPost = useCallback(async () => {
    setPostLoading(true);
    try {
      const res = await fetch(`/api/groups/${lessonId}/stream?page=1&limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      const found = (data.posts ?? []).find((p: StreamPostWithAuthor) => p.id === postId);
      setPost(found ?? null);
    } finally {
      setPostLoading(false);
    }
  }, [lessonId, postId]);

  const fetchSubmission = useCallback(async () => {
    setSubLoading(true);
    try {
      const res = await fetch(`/api/groups/${lessonId}/stream/post/${postId}/submissions`);
      if (!res.ok) { setSubmission(null); return; }
      const data = await res.json();
      setSubmission(data.my_submission ?? null);
    } finally {
      setSubLoading(false);
    }
  }, [lessonId, postId]);

  const fetchPrivateComments = useCallback(async () => {
    const res = await fetch(`/api/groups/${lessonId}/stream/post/${postId}/private-comments`);
    if (!res.ok) return;
    const data = await res.json();
    setPrivateComments(data.comments ?? []);
  }, [lessonId, postId]);

  useEffect(() => {
    fetchPost();
    fetchSubmission();
    fetchPrivateComments();
  }, [fetchPost, fetchSubmission, fetchPrivateComments]);

  async function handleSendPrivateComment() {
    const content = privateComment.trim();
    if (!content || sendingPrivate) return;
    setSendingPrivate(true);
    try {
      const res = await fetch(`/api/groups/${lessonId}/stream/post/${postId}/private-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to send');
      const data = await res.json();
      setPrivateComments((prev) => [...prev, data.comment]);
      setPrivateComment('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to send comment');
    } finally {
      setSendingPrivate(false);
    }
  }

  // Derive panel state from submission
  useEffect(() => {
    if (subLoading) return;
    if (!submission) {
      setPanelState(queuedFiles.length > 0 ? 'queued' : 'empty');
    } else if (submission.status === 'graded') {
      setPanelState('graded');
    } else {
      setPanelState('submitted');
    }
  }, [submission, subLoading, queuedFiles.length]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`my-submission-${postId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lesson_submissions', filter: `post_id=eq.${postId}` },
        () => fetchSubmission()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [postId, fetchSubmission]);

  async function uploadFile(file: File): Promise<UploadedFile> {
    const path = `${lessonId}/${postId}/${currentUserId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('submissions').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('submissions').getPublicUrl(path);
    return { path, publicUrl, fileName: file.name, size: file.size };
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(arr.map(uploadFile));
      setQueuedFiles((prev) => {
        const names = new Set(prev.map((f) => f.fileName));
        const newOnes = uploaded.filter((u) => !names.has(u.fileName));
        return [...prev, ...newOnes];
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      alert(`Upload failed: ${msg}`);
    } finally {
      setUploading(false);
    }
  }

  async function removeQueued(index: number) {
    const file = queuedFiles[index];
    // Delete from storage
    await supabase.storage.from('submissions').remove([file.path]);
    setQueuedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!queuedFiles.length) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/groups/${lessonId}/stream/post/${postId}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: queuedFiles[0].publicUrl,
          file_name: queuedFiles[0].fileName,
          files: queuedFiles.map((f) => ({ url: f.publicUrl, name: f.fileName, size: f.size })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Submit failed');
      await fetchSubmission();
      setQueuedFiles([]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnsubmit() {
    if (!submission) return;
    setUnsubmitting(true);
    try {
      const res = await fetch(`/api/groups/${lessonId}/stream/post/${postId}/submissions`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Unsubmit failed');
      // Restore previously submitted files as queued
      const prevFiles: UploadedFile[] = (submission.files ?? (
        submission.file_url && submission.file_name
          ? [{ url: submission.file_url, name: submission.file_name, size: 0 }]
          : []
      )).map((f: { url: string; name: string; size: number }) => ({
        publicUrl: f.url,
        fileName: f.name,
        size: f.size,
        path: `submissions/${lessonId}/${postId}/${currentUserId}/${f.name}`,
      }));
      setSubmission(null);
      setQueuedFiles(prevFiles);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Unsubmit failed');
    } finally {
      setUnsubmitting(false);
    }
  }

  const submittedFiles: { url: string; name: string; size: number }[] =
    submission?.files ??
    (submission?.file_url && submission?.file_name
      ? [{ url: submission.file_url, name: submission.file_name, size: 0 }]
      : []);

  const panelStatusLabel = {
    empty: 'Assigned',
    queued: 'Ready',
    submitted: 'Submitted',
    graded: 'Graded',
  }[panelState];

  const panelStatusClass = {
    empty: 'bg-[#f3f4f6] text-[#6b7280]',
    queued: 'bg-[#fff7ed] text-[#c2410c]',
    submitted: 'bg-[#e8f5ee] text-[#199358]',
    graded: 'bg-[#eff6ff] text-[#2563eb]',
  }[panelState];

  if (postLoading) {
    return (
      <div className="flex-1 overflow-y-auto bg-[#f5f6f8] p-7">
        <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        <div className="grid grid-cols-[1fr_320px] gap-6">
          <div style={{ background: '#fff', borderRadius: 14, height: 400, border: '1px solid #e5e7eb', backgroundImage: 'linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
          <div style={{ background: '#fff', borderRadius: 14, height: 300, border: '1px solid #e5e7eb', backgroundImage: 'linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f5f6f8]">
        <div className="text-center">
          <p className="text-[15px] font-semibold text-[#374151]">Post not found</p>
          <button onClick={() => router.back()} className="mt-3 text-[13px] text-[#199358] hover:underline font-medium">Go back</button>
        </div>
      </div>
    );
  }

  const feedbackJson: { question: string; correct: boolean }[] | null =
    submission?.feedback && typeof submission.feedback === 'object' && Array.isArray(submission.feedback)
      ? (submission.feedback as { question: string; correct: boolean }[])
      : null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f5f6f8]">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-[#e5e7eb] px-7 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => router.push(`/lessons/${lessonId}?tab=stream`)}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6b7280] hover:bg-[#f3f4f6] px-2.5 py-1.5 rounded-[8px] transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6" /></svg>
          Back to stream
        </button>
        <div className="h-4 w-px bg-[#e5e7eb]" />
        <div>
          <p className="text-[15px] font-bold text-[#111827] leading-tight">{post.message_body}</p>
          <p className="text-[12px] text-[#6b7280]">Assignment</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-7">
        <div className="grid grid-cols-[1fr_320px] gap-6 items-start">

          {/* ── Left: assignment detail card ── */}
          <div>
            <div className="bg-white rounded-[14px] border border-[#e5e7eb] overflow-hidden">
              {/* Top section */}
              <div className="flex items-start gap-4 p-7 border-b border-[#f3f4f6]">
                <div className="w-[52px] h-[52px] rounded-[14px] bg-[#f5f3ff] flex items-center justify-center flex-shrink-0">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-[22px] font-extrabold text-[#111827] mb-1.5 leading-tight">{post.message_body}</h1>
                  <p className="text-[13px] text-[#6b7280] mb-3">
                    Posted by {post.author?.full_name ?? 'Tutor'} · {fmtDate(post.created_at)}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {post.marks_available && (
                      <span className="inline-flex items-center gap-1.5 bg-[#f3f4f6] text-[#4b5563] text-[12px] font-semibold px-3 py-1.5 rounded-[8px]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                        {post.marks_available} marks
                      </span>
                    )}
                    {post.due_date && (
                      <span className="inline-flex items-center gap-1.5 bg-[#f3f4f6] text-[#4b5563] text-[12px] font-semibold px-3 py-1.5 rounded-[8px]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                        Due {fmtDate(post.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="px-7 py-6 border-b border-[#f3f4f6]">
                <p className="text-[15px] text-[#374151] leading-[1.75] whitespace-pre-wrap">
                  {post.message_body}
                </p>
              </div>

              {/* Class comments */}
              <div className="px-7 py-5">
                <div className="flex items-center gap-2 mb-4">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth={2}><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>
                  <span className="text-[14px] font-bold text-[#374151]">Class comments</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#7c3aed] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                    {currentUserAvatar ? (
                      <img src={currentUserAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      getInitials(currentUserName)
                    )}
                  </div>
                  <input
                    value={classComment}
                    onChange={(e) => setClassComment(e.target.value)}
                    placeholder="Add a class comment..."
                    className="flex-1 px-3 py-2 border border-[#e5e7eb] rounded-[10px] text-[14px] outline-none focus:border-[#199358] transition-colors"
                  />
                  <button
                    onClick={() => setClassComment('')}
                    className="w-8 h-8 rounded-[8px] bg-[#199358] border-none flex items-center justify-center cursor-pointer flex-shrink-0"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5}><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: Your Work panel ── */}
          <div className="sticky top-4">
            {/* Your work card */}
            <div className="bg-white rounded-[14px] border border-[#e5e7eb] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#f3f4f6] flex items-center justify-between">
                <span className="text-[15px] font-bold text-[#111827]">Your work</span>
                <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full ${panelStatusClass}`}>
                  {panelStatusLabel}
                </span>
              </div>

              <div className="p-5">
                {/* ── State A: Empty ── */}
                {panelState === 'empty' && (
                  <>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                      className={`border-2 border-dashed rounded-[10px] p-6 text-center cursor-pointer transition-all mb-3 ${
                        dragOver ? 'border-[#199358] bg-[#e8f5ee]' : 'border-[#e5e7eb] hover:border-[#199358] hover:bg-[#e8f5ee]'
                      }`}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={1.5} style={{ display: 'block', margin: '0 auto 8px' }}>
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                      </svg>
                      <p className="text-[13px] font-semibold text-[#374151] mb-1">
                        {uploading ? 'Uploading…' : 'Drag & drop or click to upload'}
                      </p>
                      <p className="text-[12px] text-[#9ca3af]">JPG, PNG, PDF · max 20MB</p>
                    </div>
                    <p className="text-[12px] text-[#9ca3af] text-center">Files won't submit until you click Submit</p>
                  </>
                )}

                {/* ── State B: Queued ── */}
                {panelState === 'queued' && (
                  <>
                    <div className="space-y-1.5 mb-3">
                      {queuedFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-[8px]">
                          <div className="w-7 h-7 rounded-[6px] bg-[#e8f5ee] flex items-center justify-center flex-shrink-0">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#199358" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
                          </div>
                          <span className="flex-1 text-[13px] font-semibold text-[#111827] truncate">{f.fileName}</span>
                          <span className="text-[11px] text-[#9ca3af] whitespace-nowrap">{fmtSize(f.size)}</span>
                          <button onClick={() => removeQueued(i)} className="text-[#d1d5db] hover:text-[#dc2626] text-[17px] leading-none p-0.5 transition-colors">×</button>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2 border-[1.5px] border-dashed border-[#e5e7eb] rounded-[8px] text-[13px] font-semibold text-[#9ca3af] hover:border-[#199358] hover:text-[#199358] hover:bg-[#e8f5ee] flex items-center justify-center gap-1.5 mb-3 transition-all"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>
                      Add another file
                    </button>

                    <button
                      onClick={handleSubmit}
                      disabled={submitting || uploading}
                      className="w-full py-3 rounded-[10px] bg-[#199358] text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" /></svg>
                      {submitting ? 'Submitting…' : 'Submit'}
                    </button>
                    <p className="text-[12px] text-[#9ca3af] text-center mt-2">Files won't submit until you click Submit</p>
                  </>
                )}

                {/* ── State C: Submitted ── */}
                {panelState === 'submitted' && submission && (
                  <>
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#199358] mb-3">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M5 12l5 5L20 7" /></svg>
                      Submitted {fmtDateTime(submission.submitted_at)}
                    </div>

                    <div className="space-y-1.5 mb-4">
                      {submittedFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 bg-[#e8f5ee] border border-[#c6e8d4] rounded-[8px]">
                          <div className="w-7 h-7 rounded-[6px] bg-[#199358] flex items-center justify-center flex-shrink-0">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
                          </div>
                          <span className="flex-1 text-[13px] font-semibold text-[#111827] truncate">{f.name}</span>
                          <span className="text-[11px] font-semibold text-[#137a48]">✓</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={handleUnsubmit}
                      disabled={unsubmitting}
                      className="w-full py-2.5 border-[1.5px] border-[#e5e7eb] rounded-[9px] bg-white text-[13px] font-semibold text-[#4b5563] hover:border-[#dc2626] hover:text-[#dc2626] hover:bg-[#fef2f2] flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 7v6h6M3 13a9 9 0 105.5-8.4" /></svg>
                      {unsubmitting ? 'Unsubmitting…' : 'Unsubmit'}
                    </button>
                    <p className="text-[12px] text-[#9ca3af] text-center mt-2">Unsubmitting lets you make changes and resubmit</p>
                  </>
                )}

                {/* ── State D: Graded ── */}
                {panelState === 'graded' && submission && (
                  <>
                    <div className="bg-[#e8f5ee] border border-[#c6e8d4] rounded-[10px] p-4 flex items-center justify-between mb-3">
                      <div>
                        <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wide mb-1">Your grade</p>
                        <p className="text-[22px] font-extrabold text-[#137a48]">
                          {submission.score}
                          <span className="text-[14px] font-medium text-[#9ca3af] ml-1">/ {submission.score_total}</span>
                        </p>
                      </div>
                      {submission.result && (
                        <span className={`px-3 py-1.5 rounded-full text-[12px] font-bold ${submission.result === 'pass' ? 'bg-[#199358] text-white' : 'bg-[#dc2626] text-white'}`}>
                          {submission.result === 'pass' ? '✓ Pass' : '✗ Fail'}
                        </span>
                      )}
                    </div>

                    {/* Submitted files */}
                    {submittedFiles.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {submittedFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 bg-[#e8f5ee] border border-[#c6e8d4] rounded-[8px]">
                            <div className="w-7 h-7 rounded-[6px] bg-[#199358] flex items-center justify-center flex-shrink-0">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
                            </div>
                            <span className="flex-1 text-[13px] font-semibold text-[#111827] truncate">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Question breakdown */}
                    {feedbackJson && feedbackJson.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {feedbackJson.map((q, i) => (
                          <span
                            key={i}
                            className={`text-[11px] font-bold px-2 py-1 rounded-[6px] ${q.correct ? 'bg-[#e8f5ee] text-[#199358]' : 'bg-[#fef2f2] text-[#dc2626]'}`}
                            title={q.question}
                          >
                            Q{i + 1} {q.correct ? '✓' : '✗'}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
                />
              </div>
            </div>

            {/* Private comments */}
            <div className="bg-white rounded-[14px] border border-[#e5e7eb] p-5 mt-3.5">
              <div className="flex items-center gap-2 mb-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                <span className="text-[13px] font-bold text-[#374151]">Private comments</span>
              </div>

              {privateComments.length > 0 && (
                <div className="space-y-2.5 mb-3 max-h-[240px] overflow-y-auto">
                  {privateComments.map((c) => {
                    const isMe = c.author_id === currentUserId;
                    const initials = getInitials(c.author?.full_name ?? '?');
                    return (
                      <div key={c.id} className={`flex items-start gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <div className="w-7 h-7 rounded-full bg-[#7c3aed] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 overflow-hidden">
                          {c.author?.avatar_url
                            ? <img src={c.author.avatar_url} alt="" className="w-full h-full object-cover" />
                            : initials}
                        </div>
                        <div className={`max-w-[85%] px-3 py-2 rounded-[10px] text-[13px] leading-[1.5] ${isMe ? 'bg-[#199358] text-white' : 'bg-[#f3f4f6] text-[#374151]'}`}>
                          <p>{c.content}</p>
                          <p className={`text-[10px] mt-1 ${isMe ? 'text-[#b2dfc6]' : 'text-[#9ca3af]'}`}>
                            {new Date(c.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <textarea
                rows={3}
                value={privateComment}
                onChange={(e) => setPrivateComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendPrivateComment(); }}
                placeholder="Add a private comment to your tutor..."
                className="w-full px-3 py-2.5 border border-[#e5e7eb] rounded-[8px] text-[13px] font-inherit outline-none resize-none focus:border-[#199358] transition-colors"
              />
              <button
                onClick={handleSendPrivateComment}
                disabled={sendingPrivate || !privateComment.trim()}
                className="mt-2 px-4 py-1.5 bg-[#199358] text-white text-[13px] font-semibold rounded-[7px] border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sendingPrivate ? 'Sending…' : 'Send'}
              </button>
              <p className="text-[11px] text-[#9ca3af] mt-1.5">Only visible to you and your tutor</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
