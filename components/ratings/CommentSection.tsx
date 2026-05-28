'use client';

import { useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, Flag, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarRow } from './StarInput';
import { supabase } from '@/lib/supabase/client';

type Comment = {
  id: string;
  authorName: string;
  authorInitials: string;
  body: string;
  rating?: number;
  createdAt: string;
  likes: number;
  dislikes: number;
  myReaction?: 'up' | 'down' | null;
  reply?: { body: string; tutorName: string; createdAt: string };
};

type Props = {
  targetKind: 'class' | 'tutor';
  targetId: string;
  viewerIsOwnerTutor?: boolean;
  viewerLoggedIn?: boolean;
  activeRatingFilter: number | null;
  onClearFilter: () => void;
};

const PAGE = 10;

export function CommentSection({ targetKind, targetId, viewerIsOwnerTutor, viewerLoggedIn = true, activeRatingFilter, onClearFilter }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(PAGE);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  useEffect(() => {
    fetchComments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, targetKind]);

  async function fetchComments() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('ratings')
        .select(`
          id, comment, stars, created_at,
          student:profiles!ratings_student_id_fkey(full_name, display_name),
          tutor_reply, tutor_reply_at
        `)
        .eq(targetKind === 'tutor' ? 'tutor_id' : 'group_id', targetId)
        .not('comment', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);

      setComments((data ?? []).map((r: any): Comment => {
        const student = Array.isArray(r.student) ? r.student[0] : r.student;
        const name = student?.display_name || student?.full_name || 'Student';
        const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
        return {
          id: r.id,
          authorName: name,
          authorInitials: initials,
          body: r.comment,
          rating: r.stars,
          createdAt: formatRelative(r.created_at),
          likes: 0,
          dislikes: 0,
          myReaction: null,
          reply: r.tutor_reply ? { body: r.tutor_reply, tutorName: 'Tutor', createdAt: formatRelative(r.tutor_reply_at) } : undefined,
        };
      }));
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }

  const submitComment = async () => {
    if (!draft.trim()) return;
    const optimistic: Comment = {
      id: `tmp-${Date.now()}`,
      authorName: 'You',
      authorInitials: 'YO',
      body: draft,
      createdAt: 'Just now',
      likes: 0,
      dislikes: 0,
    };
    setComments([optimistic, ...comments]);
    setDraft('');
    setFocused(false);
  };

  const submitReply = async (id: string) => {
    if (!replyDraft.trim()) return;
    setComments(comments.map((c) =>
      c.id === id ? { ...c, reply: { body: replyDraft, tutorName: 'You', createdAt: 'Just now' } } : c
    ));
    setReplyingId(null);
    setReplyDraft('');
  };

  const react = (id: string, dir: 'up' | 'down') => {
    setComments(comments.map((c) => {
      if (c.id !== id) return c;
      const prev = c.myReaction;
      if (prev === dir) return { ...c, myReaction: null, likes: c.likes - (dir === 'up' ? 1 : 0), dislikes: c.dislikes - (dir === 'down' ? 1 : 0) };
      return {
        ...c,
        myReaction: dir,
        likes: c.likes + (dir === 'up' ? 1 : 0) - (prev === 'up' ? 1 : 0),
        dislikes: c.dislikes + (dir === 'down' ? 1 : 0) - (prev === 'down' ? 1 : 0),
      };
    }));
  };

  const filtered = activeRatingFilter == null ? comments : comments.filter((c) => c.rating === activeRatingFilter);
  const visible = filtered.slice(0, shown);

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading reviews…</div>;

  return (
    <div className="space-y-4">
      {activeRatingFilter != null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Showing {activeRatingFilter}-star reviews</span>
          <button onClick={onClearFilter} className="text-brand-deep font-semibold hover:underline text-xs">Clear filter</button>
        </div>
      )}

      {viewerLoggedIn && !viewerIsOwnerTutor && (
        <div className="rounded-2xl bg-card border border-border p-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="Leave a comment…"
            rows={focused ? 3 : 1}
            className="w-full resize-none bg-transparent text-sm focus:outline-none"
          />
          {focused && (
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => { setFocused(false); setDraft(''); }} className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={submitComment} disabled={!draft.trim()}
                className="px-4 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50">Post</button>
            </div>
          )}
        </div>
      )}

      {visible.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No reviews yet. Be the first to share your experience.
        </div>
      )}

      {visible.map((c) => (
        <div key={c.id} className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-full bg-brand/20 text-brand-deep grid place-items-center text-xs font-bold shrink-0">
              {c.authorInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-ink text-sm">{c.authorName}</span>
                {c.rating && <StarRow value={c.rating} size={13} />}
                <span className="text-[11px] text-muted-foreground">{c.createdAt}</span>
              </div>
              <p className="text-sm text-ink/90 mt-1">{c.body}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 pl-12">
            <button onClick={() => react(c.id, 'up')}
              className={cn('inline-flex items-center gap-1 text-xs font-semibold', c.myReaction === 'up' ? 'text-brand-deep' : 'text-muted-foreground hover:text-ink')}>
              <ThumbsUp className="size-3.5" /> {c.likes > 0 ? c.likes : ''}
            </button>
            <button onClick={() => react(c.id, 'down')}
              className={cn('inline-flex items-center gap-1 text-xs font-semibold', c.myReaction === 'down' ? 'text-rose-600' : 'text-muted-foreground hover:text-ink')}>
              <ThumbsDown className="size-3.5" /> {c.dislikes > 0 ? c.dislikes : ''}
            </button>
            {viewerIsOwnerTutor && !c.reply && (
              <button onClick={() => { setReplyingId(c.id); setReplyDraft(''); }}
                className="text-xs font-semibold text-brand-deep hover:underline ml-auto">Reply</button>
            )}
          </div>

          {c.reply && (
            <div className="ml-12 rounded-xl bg-muted/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-deep">
                {c.reply.tutorName} <span className="text-muted-foreground font-normal">{c.reply.createdAt}</span>
              </div>
              <p className="text-sm text-ink/80 mt-1">{c.reply.body}</p>
            </div>
          )}

          {replyingId === c.id && (
            <div className="ml-12 space-y-2">
              <textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} placeholder="Write a reply…" rows={2}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setReplyingId(null)} className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
                <button onClick={() => submitReply(c.id)} disabled={!replyDraft.trim()}
                  className="px-4 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50">Reply</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {filtered.length > shown && (
        <button onClick={() => setShown(shown + PAGE)}
          className="w-full py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted text-muted-foreground">
          Load more ({filtered.length - shown} remaining)
        </button>
      )}
    </div>
  );
}

function formatRelative(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.round(diff / 86400000)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
