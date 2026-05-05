'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

interface Submission {
  student_id: string;
  student_name: string;
  student_avatar: string | null;
  file_url: string | null;
  file_name: string | null;
  status: 'pending' | 'graded' | null;
  score: number | null;
  score_total: number | null;
  result: 'pass' | 'fail' | null;
  submitted_at: string | null;
}

interface MySubmission {
  file_url: string | null;
  file_name: string | null;
  status: 'pending' | 'graded' | null;
  score: number | null;
  score_total: number | null;
  result: 'pass' | 'fail' | null;
  submitted_at: string | null;
}

interface AssignmentPostCardProps {
  postId: string;
  groupId: string;
  groupTitle: string;
  content: string;
  marksAvailable: number | null;
  dueDate: string | null;
  isTutor: boolean;
  currentUserId: string;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
}

export default function AssignmentPostCard({
  postId,
  groupId,
  groupTitle,
  content,
  marksAvailable,
  dueDate,
  isTutor,
  currentUserId,
}: AssignmentPostCardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [mySubmission, setMySubmission] = useState<MySubmission | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [gradingNav, setGradingNav] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/stream/post/${postId}/submissions`);
      if (!res.ok) return;
      const data = await res.json();
      if (isTutor) {
        setSubmissions(data.submissions ?? []);
        setEnrolledCount(data.enrolled_count ?? 0);
      } else {
        setMySubmission(data.my_submission ?? null);
      }
    } finally {
      setLoadingData(false);
    }
  }, [groupId, postId, isTutor]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription for tutor view
  useEffect(() => {
    if (!isTutor) return;
    const channel = supabase
      .channel(`submissions-${postId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_submissions', filter: `post_id=eq.${postId}` }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [postId, isTutor, supabase, fetchData]);

  const submitFile = async (file: File) => {
    const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
    const MAX_MB = 20;
    if (!ALLOWED.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|pdf)$/i)) {
      setUploadError('Only JPG, PNG, or PDF files are allowed.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`File too large (max ${MAX_MB}MB).`);
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/groups/${groupId}/stream/post/${postId}/submissions`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? 'Upload failed. Try again.');
        return;
      }
      setMySubmission(data.submission);
    } catch {
      setUploadError('Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) submitFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) submitFile(file);
  };

  const handleGradeWithAI = async () => {
    const pending = submissions.filter((s) => s.file_url);
    if (pending.length === 0) return;
    setGradingNav(true);
    const prefill = {
      source: 'lesson',
      groupId,
      groupTitle,
      postId,
      postTitle: content.split('\n')[0].slice(0, 80),
      marksAvailable: marksAvailable ?? 0,
      students: pending.map((s) => ({
        id: s.student_id,
        name: s.student_name,
        fileUrl: s.file_url,
        fileName: s.file_name ?? 'submission',
      })),
    };
    sessionStorage.setItem('itutor_ai_prefill', JSON.stringify(prefill));
    router.push('/tools/ai?source=lesson');
  };

  const submittedCount = submissions.filter((s) => s.file_url).length;
  const pendingCount = submissions.filter((s) => s.file_url && s.status !== 'graded').length;

  if (loadingData) {
    return (
      <div className="mt-3 pt-3 border-t border-[#e4e8ee]">
        <div className="h-4 w-32 bg-[#f0f0f0] rounded animate-pulse mb-2" />
        <div className="h-4 w-48 bg-[#f0f0f0] rounded animate-pulse" />
      </div>
    );
  }

  /* ── TUTOR VIEW ── */
  if (isTutor) {
    return (
      <div className="mt-3 pt-3 border-t border-[#e4e8ee]">
        <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#6b7280] mb-2">
          Submissions — {submittedCount} / {enrolledCount}
        </p>
        {submissions.length === 0 ? (
          <p className="text-[12px] text-[#9ca3af] italic">No students enrolled yet.</p>
        ) : (
          <div className="space-y-[6px] mb-3">
            {submissions.map((s) => {
              const hasFile = !!s.file_url;
              const isGraded = s.status === 'graded';
              const pass = s.result === 'pass';
              return (
                <div key={s.student_id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-[8px] hover:bg-[#f9fafb] transition-colors">
                  {s.student_avatar ? (
                    <img src={s.student_avatar} alt={s.student_name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#0d9668] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {getInitials(s.student_name)}
                    </div>
                  )}
                  <span className="flex-1 text-[12.5px] font-medium text-[#111827] truncate">{s.student_name}</span>
                  {hasFile ? (
                    <a
                      href={s.file_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#6b7280] truncate max-w-[120px] hover:underline"
                    >
                      {s.file_name}
                    </a>
                  ) : (
                    <span className="text-[11px] text-[#d1d5db] italic">—</span>
                  )}
                  {isGraded ? (
                    <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full ${pass ? 'bg-[#d1fae5] text-[#047857]' : 'bg-[#fee2e2] text-[#dc2626]'}`}>
                      {s.score} / {s.score_total} · {pass ? 'Pass ✓' : 'Fail ✗'}
                    </span>
                  ) : hasFile ? (
                    <span className="ml-auto text-[11px] text-[#0d9668] font-medium">Submitted ✓</span>
                  ) : (
                    <span className="ml-auto text-[11px] text-[#9ca3af]">Not submitted</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-end">
          <button
            onClick={handleGradeWithAI}
            disabled={pendingCount === 0 || gradingNav}
            className="flex items-center gap-2 px-4 py-[9px] bg-[#0d9668] hover:bg-[#047857] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-[10px] text-[12.5px] font-semibold transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 010 14.14" /><path d="M4.93 4.93a10 10 0 000 14.14" /></svg>
            {gradingNav ? 'Opening iTutor AI…' : `Grade with iTutor AI${pendingCount > 0 ? ` (${pendingCount} paper${pendingCount !== 1 ? 's' : ''})` : ''}`}
          </button>
        </div>
      </div>
    );
  }

  /* ── STUDENT VIEW ── */
  const isGraded = mySubmission?.status === 'graded';
  const hasSubmitted = !!mySubmission?.file_url;

  return (
    <div className="mt-3 pt-3 border-t border-[#e4e8ee]">
      <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#6b7280] mb-2">Your submission</p>

      {isGraded ? (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-[#f0fdf4] border border-[#bbf7d0]">
          <svg className="text-[#0d9668]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
          <div>
            <p className="text-[13px] font-semibold text-[#047857]">
              Graded · {mySubmission.score} / {mySubmission.score_total ?? marksAvailable} · {mySubmission.result === 'pass' ? 'Pass ✓' : 'Fail ✗'}
            </p>
            <p className="text-[11px] text-[#6b7280]">{mySubmission.file_name}</p>
          </div>
        </div>
      ) : hasSubmitted ? (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-[10px] bg-[#f0fdf4] border border-[#bbf7d0]">
          <div className="flex items-center gap-2">
            <svg className="text-[#0d9668]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            <span className="text-[12.5px] font-medium text-[#047857]">✓ Submitted — {mySubmission.file_name}</span>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-[11px] text-[#6b7280] hover:text-[#0d9668] hover:underline disabled:opacity-40"
          >
            Re-submit
          </button>
          <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={handleFileChange} />
        </div>
      ) : (
        <div>
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-[12px] px-4 py-6 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-[#0d9668] bg-[#f0fdf4]' : 'border-[#d1d5db] hover:border-[#0d9668] hover:bg-[#f9fafb]'
            } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-[#0d9668] border-t-transparent rounded-full animate-spin" />
                <p className="text-[12px] text-[#6b7280]">Uploading…</p>
              </div>
            ) : (
              <>
                <svg className="mx-auto mb-2 text-[#9ca3af]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                <p className="text-[13px] font-medium text-[#374151]">Drag &amp; drop or click to upload</p>
                <p className="text-[11px] text-[#9ca3af] mt-0.5">JPG, PNG or PDF · max 20MB</p>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={handleFileChange} />
          {uploadError && <p className="text-[11px] text-[#ef4444] mt-1.5">{uploadError}</p>}
          <div className="flex justify-end mt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-5 py-[8px] bg-[#0d9668] hover:bg-[#047857] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-[10px] text-[12.5px] font-semibold transition-colors"
            >
              Submit Paper
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
