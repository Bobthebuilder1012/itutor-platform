'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import { CommentCard } from './CommentCard';
import type { Comment, EligibilityResponse } from '@/lib/types/comments';

const LIMIT = 10;

type Props = {
  targetType: 'class' | 'tutor_profile';
  targetId: string;
  starFilter: number | null;
  onClearFilter: () => void;
  /** Pass tutor's profile ID if the viewer is the tutor who owns this target */
  viewerTutorId?: string | null;
};

type UserProfile = {
  id: string;
  full_name: string;
  display_name: string | null;
  avatar_url: string | null;
};

function Avatar({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const initials = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  if (avatarUrl) return <img src={avatarUrl} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white bg-brand shrink-0" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

export function CommentSection({ targetType, targetId, starFilter, onClearFilter, viewerTutorId }: Props) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityResponse | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [commentsOffset, setCommentsOffset] = useState(0);

  const [inputExpanded, setInputExpanded] = useState(false);
  const [inputBody, setInputBody] = useState('');
  const [posting, setPosting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const commentApiType = targetType === 'class' ? 'class_comment' : 'tutor_profile_comment';

  // Fetch current user profile
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('profiles')
        .select('id, full_name, display_name, avatar_url')
        .eq('id', user.id)
        .single()
        .then(({ data }) => data && setCurrentUser(data));
    });
  }, []);

  // Fetch eligibility whenever target or user changes
  useEffect(() => {
    fetch(`/api/comments/eligibility?targetType=${targetType}&targetId=${targetId}`)
      .then((r) => r.json())
      .then(setEligibility)
      .catch(() => {});
  }, [targetType, targetId, currentUser?.id]);

  // Fetch comments
  const fetchComments = useCallback(async (reset: boolean) => {
    const off = reset ? 0 : commentsOffset;
    if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const idParam = targetType === 'class' ? `classId=${targetId}` : `tutorId=${targetId}`;
      const starParam = starFilter ? `&starFilter=${starFilter}` : '';
      const res = await fetch(`/api/comments/${targetType === 'class' ? 'class' : 'tutor'}?${idParam}${starParam}&limit=${LIMIT}&offset=${off}`);
      if (!res.ok) return;
      const data = await res.json();
      if (reset) setComments(data.comments ?? []);
      else setComments((prev) => [...prev, ...(data.comments ?? [])]);
      setTotal(data.total ?? 0);
      if (!reset) setCommentsOffset(off + LIMIT);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId, starFilter, commentsOffset]);

  useEffect(() => {
    setCommentsOffset(0);
    setComments([]);
    fetchComments(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId, starFilter]);

  async function handlePost() {
    if (!inputBody.trim() || posting || !eligibility) return;
    setPosting(true);
    try {
      const payload: Record<string, unknown> = { body: inputBody.trim() };
      if (targetType === 'class') {
        payload.classId = targetId;
        payload.billingPeriod = eligibility.availableBillingPeriod;
      } else {
        payload.tutorId = targetId;
        payload.sessionId = eligibility.availableSessionIds?.[0];
      }

      const res = await fetch(`/api/comments/${targetType === 'class' ? 'class' : 'tutor'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const newComment = await res.json();
        const enriched: Comment = {
          ...newComment,
          author: {
            id: currentUser?.id ?? '',
            full_name: currentUser?.full_name ?? '',
            display_name: currentUser?.display_name ?? null,
            avatar_url: currentUser?.avatar_url ?? null,
          },
          reply: null,
          user_reaction: null,
        };
        setComments((prev) => [enriched, ...prev]);
        setTotal((t) => t + 1);
        setInputBody('');
        setInputExpanded(false);
      }
    } finally {
      setPosting(false);
    }
  }

  function handleCommentUpdate(updated: Comment) {
    setComments((prev) => prev.map((c) => c.id === updated.id ? updated : c));
  }

  function handleCommentDelete(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }

  const hasMore = comments.length < total;
  const placeholderText = targetType === 'class' ? 'Share your experience with this class.' : 'Share your experience with this tutor.';

  return (
    <section aria-label="Reviews and Comments" className="mt-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-xl font-bold text-ink">
          Reviews &amp; Comments
          <span className="ml-2 text-base font-normal text-muted-foreground" aria-live="polite">({total.toLocaleString()})</span>
        </h2>

        {starFilter !== null && (
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#E8F8EE] text-sm text-brand font-medium">
            <span>Showing {starFilter}★ ratings only</span>
            <button onClick={onClearFilter} className="text-brand hover:text-brand-deep font-bold leading-none" aria-label="Clear star filter">
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Write input — only if logged in and eligible */}
      {eligibility?.canComment && (
        <div className="mb-5 rounded-2xl border border-border bg-white p-3 shadow-card">
          <div className="flex items-start gap-3">
            {currentUser && (
              <div className="shrink-0 mt-0.5">
                <Avatar name={currentUser.full_name || 'You'} avatarUrl={currentUser.avatar_url} size={32} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {!inputExpanded ? (
                <button
                  onClick={() => { setInputExpanded(true); setTimeout(() => inputRef.current?.focus(), 0); }}
                  className="w-full text-left text-sm text-muted-foreground px-3 py-2 rounded-xl border border-border hover:border-brand transition"
                >
                  {placeholderText}
                </button>
              ) : (
                <>
                  <textarea
                    ref={inputRef}
                    value={inputBody}
                    onChange={(e) => setInputBody(e.target.value)}
                    placeholder={placeholderText}
                    rows={3}
                    maxLength={1000}
                    className="w-full p-3 rounded-xl border border-brand bg-white text-sm resize-none focus:outline-none"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className={cn('text-xs tabular-nums', inputBody.length > 1000 ? 'text-red-500' : 'text-muted-foreground')}>
                      {inputBody.length} / 1000
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setInputExpanded(false); setInputBody(''); }}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handlePost}
                        disabled={!inputBody.trim() || inputBody.length > 1000 || posting}
                        className={cn(
                          'px-4 py-1.5 rounded-xl text-xs font-semibold text-white transition',
                          inputBody.trim() && inputBody.length <= 1000 && !posting
                            ? 'bg-brand hover:bg-brand-deep'
                            : 'bg-gray-200 cursor-not-allowed text-gray-400',
                        )}
                      >
                        {posting ? 'Posting…' : 'Post'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Already commented message */}
      {eligibility && !eligibility.canComment && eligibility.hasExistingComment && (
        <div className="mb-5 rounded-2xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground italic">
          {targetType === 'class'
            ? "You've already shared feedback for this billing period."
            : "You've already shared feedback for this session."}
        </div>
      )}

      {/* Comment list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="size-8 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-1/4" />
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {starFilter !== null
            ? 'No comments at this rating level yet.'
            : eligibility?.canComment
            ? 'No comments yet. Be the first to share your experience.'
            : 'No comments yet.'}
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => {
            const isOwn = comment.author_id === currentUser?.id;
            const canReply = !!viewerTutorId && viewerTutorId === targetId && !comment.reply;
            return (
              <CommentCard
                key={comment.id}
                comment={comment}
                targetType={commentApiType}
                targetId={comment.id}
                canReact={!!(eligibility?.canReact)}
                canReply={canReply}
                isOwn={isOwn}
                currentUserId={currentUser?.id ?? null}
                onUpdate={handleCommentUpdate}
                onDelete={handleCommentDelete}
              />
            );
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <button
          onClick={() => { setCommentsOffset(comments.length); fetchComments(false); }}
          disabled={loadingMore}
          className="mt-4 w-full py-2.5 rounded-2xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  );
}
