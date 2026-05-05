'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StreamPostWithAuthor } from '@/lib/types/groupStream';
import { timeAgo } from './timeAgo';

function fmtDue(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function isDueSoon(iso: string | null) {
  if (!iso) return false;
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

interface SubmissionStatus {
  [postId: string]: 'none' | 'pending' | 'graded';
}

interface StudentStreamViewProps {
  groupId: string;
  lessonId: string;
}

const POST_ICON: Record<string, { bg: string; stroke: string; path: string }> = {
  assignment: {
    bg: '#f5f3ff',
    stroke: '#7c3aed',
    path: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8',
  },
  content: {
    bg: '#e0f2fe',
    stroke: '#0284c7',
    path: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6',
  },
  announcement: {
    bg: '#fef3c7',
    stroke: '#d97706',
    path: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  },
  discussion: {
    bg: '#e8f5ee',
    stroke: '#199358',
    path: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  },
};

function PostIcon({ type }: { type: string }) {
  const cfg = POST_ICON[type] ?? POST_ICON.discussion;
  return (
    <div className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={cfg.stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={cfg.path} />
      </svg>
    </div>
  );
}

function StatusPill({ status }: { status: 'none' | 'pending' | 'graded' }) {
  if (status === 'pending') return (
    <span className="text-[11px] font-bold px-2.5 py-[3px] rounded-full bg-[#e8f5ee] text-[#199358]">Submitted ✓</span>
  );
  if (status === 'graded') return (
    <span className="text-[11px] font-bold px-2.5 py-[3px] rounded-full bg-[#eff6ff] text-[#2563eb]">Graded</span>
  );
  return (
    <span className="text-[11px] font-bold px-2.5 py-[3px] rounded-full bg-[#f3f4f6] text-[#6b7280]">Assigned</span>
  );
}

export default function StudentStreamView({ groupId, lessonId }: StudentStreamViewProps) {
  const router = useRouter();
  const [posts, setPosts] = useState<StreamPostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submissionStatuses, setSubmissionStatuses] = useState<SubmissionStatus>({});

  const fetchStream = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/stream?page=1&limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      setPosts(data.posts ?? []);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { fetchStream(); }, [fetchStream]);

  // Fetch submission statuses for assignment posts
  useEffect(() => {
    const assignmentPosts = posts.filter((p) => p.post_type === 'assignment');
    if (!assignmentPosts.length) return;

    Promise.all(
      assignmentPosts.map(async (p) => {
        try {
          const res = await fetch(`/api/groups/${groupId}/stream/post/${p.id}/submissions`);
          if (!res.ok) return [p.id, 'none'] as const;
          const data = await res.json();
          const sub = data.my_submission;
          if (!sub) return [p.id, 'none'] as const;
          return [p.id, sub.status === 'graded' ? 'graded' : 'pending'] as const;
        } catch {
          return [p.id, 'none'] as const;
        }
      })
    ).then((results) => {
      const map: SubmissionStatus = {};
      results.forEach(([id, status]) => { map[id] = status; });
      setSubmissionStatuses(map);
    });
  }, [posts, groupId]);

  const assignmentsDueSoon = posts.filter(
    (p) => p.post_type === 'assignment' && isDueSoon(p.due_date ?? null)
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-[#e4e8ee] rounded-[12px] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] bg-[#f3f4f6] animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-[#f3f4f6] rounded animate-pulse w-3/4" />
              <div className="h-3 bg-[#f3f4f6] rounded animate-pulse w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-6 items-start">
      {/* ── Upcoming card ── */}
      <div className="bg-white border border-[#e4e8ee] rounded-[12px] p-[18px] sticky top-4">
        <p className="text-[14px] font-bold text-[#111827] mb-3">Upcoming</p>
        {assignmentsDueSoon.length === 0 ? (
          <p className="text-[13px] text-[#6b7280] leading-relaxed">No upcoming assignments due in the next 7 days.</p>
        ) : (
          <div className="space-y-1">
            {assignmentsDueSoon.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/lessons/${lessonId}/posts/${p.id}`)}
                className="w-full text-left flex items-start gap-2.5 py-2 border-b border-[#f3f4f6] last:border-none hover:bg-[#f9fafb] transition-colors rounded-[8px] px-1"
              >
                <div className="w-2 h-2 rounded-full bg-[#7c3aed] flex-shrink-0 mt-1.5" />
                <div>
                  <p className="text-[13px] font-semibold text-[#111827] leading-tight line-clamp-2">{p.message_body}</p>
                  <p className="text-[11px] text-[#dc2626] mt-0.5 font-medium">Due {fmtDue(p.due_date ?? null)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {assignmentsDueSoon.length > 0 && (
          <button className="text-[13px] font-bold text-[#199358] mt-3 hover:underline">View all</button>
        )}
      </div>

      {/* ── Post feed ── */}
      <div>
        {posts.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center bg-white border border-[#e4e8ee] rounded-[12px]">
            <div className="text-4xl mb-3">📚</div>
            <p className="text-sm font-semibold text-[#374151]">No posts yet</p>
            <p className="text-xs text-[#6b7280] mt-1">Your tutor hasn't posted anything yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => {
              const isAssignment = post.post_type === 'assignment';
              const subStatus = submissionStatuses[post.id] ?? 'none';
              const due = fmtDue(post.due_date ?? null);

              return (
                <button
                  key={post.id}
                  onClick={() => {
                    if (isAssignment) {
                      router.push(`/lessons/${lessonId}/posts/${post.id}`);
                    }
                  }}
                  className={`w-full text-left bg-white border border-[#e4e8ee] rounded-[12px] overflow-hidden transition-shadow ${isAssignment ? 'cursor-pointer hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)]' : 'cursor-default'}`}
                >
                  <div className="flex items-center gap-3.5 px-[18px] py-3.5">
                    <PostIcon type={post.post_type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-[#111827] leading-snug truncate">
                        {post.author?.full_name ?? 'Tutor'} posted
                        {post.post_type === 'assignment' && ' a new assignment'}
                        {post.post_type === 'content' && ' a new material'}
                        {post.post_type === 'announcement' && ' an announcement'}
                        {post.post_type === 'discussion' && ' a discussion'}
                        {post.message_body ? `: ${post.message_body}` : ''}
                      </p>
                      <p className="text-[13px] text-[#6b7280] mt-0.5">{timeAgo(post.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      {isAssignment && due && (
                        <span className="text-[12px] font-semibold text-[#dc2626]">Due {due}</span>
                      )}
                      {isAssignment && (
                        <StatusPill status={subStatus} />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
