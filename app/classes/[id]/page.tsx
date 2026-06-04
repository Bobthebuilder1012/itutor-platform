'use client';

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Send } from "lucide-react";
import { ClassesShell } from "@/components/classes/ClassesShell";
import { StarRating } from "@/components/classes/StarRating";
import { ClassEnrollmentCard } from "@/components/classes/ClassEnrollmentCard";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/hooks/useProfile";

/* ─── Types ──────────────────────────────────────── */

type Group = {
  id: string; name: string; subject: string; description: string;
  tutor_id: string; tutorName: string; tutorAvatar?: string; tutorVerified: boolean;
  rating: number; ratingCount: number; priceTTD: number;
  schedule: string; cover: string[]; highlights: string[];
  visibility: string; require_join_requests: boolean;
};

type Post = {
  id: string; author: string; authorAvatar?: string; role: 'Tutor' | 'Student';
  time: string; type: 'Announcement' | 'Assignment' | 'Discussion' | 'Content';
  body: string; replyCount: number;
};

type Reply = { id: string; author: string; authorAvatar?: string; body: string; time: string };

type Rating = {
  id: string; name: string; stars: number; date: string;
  comment: string | null; reply: string | null;
};

type Breakdown = { stars: number; pct: number };

const TABS = ["About", "Stream", "Ratings"] as const;
type Tab = typeof TABS[number];

const POST_COLORS: Record<string, string> = {
  Announcement: "bg-blue-500/15 text-blue-300",
  Assignment: "bg-orange-500/15 text-orange-300",
  Discussion: "bg-purple-500/15 text-purple-300",
  Content: "bg-white/10 text-white/70",
};

/* ─── Page ───────────────────────────────────────── */

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { profile } = useProfile();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || "About");
  const [group, setGroup] = useState<Group | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchGroup = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: g } = await supabase
        .from('groups')
        .select(`
          id, name, description, subject, tutor_id, visibility, require_join_requests,
          price_monthly, price_per_session, rating_average, rating_count,
          schedule_display, content_blocks,
          tutor:profiles!groups_tutor_id_fkey(id, full_name, display_name, avatar_url, tutor_verification_status)
        `)
        .eq('id', id)
        .single();
      if (!g) return;

      const tutor = Array.isArray(g.tutor) ? g.tutor[0] : g.tutor;
      setGroup({
        id: g.id, name: g.name, subject: g.subject || '',
        description: g.description || '',
        tutor_id: g.tutor_id,
        tutorName: tutor?.display_name || tutor?.full_name || 'Tutor',
        tutorAvatar: tutor?.avatar_url ?? undefined,
        tutorVerified: tutor?.tutor_verification_status === 'verified',
        rating: Number(g.rating_average ?? 0),
        ratingCount: g.rating_count ?? 0,
        priceTTD: Number(g.price_monthly ?? g.price_per_session ?? 0),
        schedule: g.schedule_display || 'Schedule TBD',
        cover: [],
        highlights: [
          'Live weekly group session',
          'Class stream with notes & assignments',
          'Monthly progress check-in',
        ],
        visibility: g.visibility || 'public',
        require_join_requests: g.require_join_requests ?? false,
      });

      // Check enrollment
      if (profile?.id) {
        const { data: mem } = await supabase
          .from('group_members')
          .select('id, status')
          .eq('group_id', id)
          .eq('user_id', profile.id)
          .in('status', ['approved', 'active'])
          .maybeSingle();
        setEnrolled(!!mem);
      }
    } finally {
      setLoading(false);
    }
  }, [id, profile?.id]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);

  const handleJoin = async () => {
    if (!group || joining) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) setEnrolled(true);
    } catch {}
    finally { setJoining(false); }
  };

  if (loading) return (
    <ClassesShell>
      <div className="py-20 flex items-center justify-center">
        <div className="animate-spin rounded-full size-10 border-b-2 border-[#32CC6F]" />
      </div>
    </ClassesShell>
  );

  if (!group) return (
    <ClassesShell>
      <div className="py-20 text-center text-[#A0A0A0]">Class not found.</div>
    </ClassesShell>
  );

  return (
    <ClassesShell>
      <Link href="/classes" className="inline-flex items-center gap-1.5 text-sm text-[#A0A0A0] hover:text-white">
        <ArrowLeft className="size-4" /> Classes
      </Link>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{group.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#1F1F1F] px-3 py-1 text-xs font-medium text-[#A0A0A0]">{group.subject}</span>
            <div className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-full bg-[#1F1F1F] text-[10px] font-bold text-white/70 overflow-hidden">
                {group.tutorAvatar
                  ? <img src={group.tutorAvatar} alt={group.tutorName} className="size-full object-cover" />
                  : group.tutorName.split(" ").map((s) => s[0]).join("")}
              </div>
              <span className="text-sm font-medium text-white">{group.tutorName}</span>
              {group.tutorVerified && <BadgeCheck className="size-4 text-[#32CC6F]" />}
            </div>
          </div>
          <div className="mt-4">
            <StarRating value={group.rating} count={group.ratingCount} size={18} />
          </div>

          {/* Tabs */}
          <div className="mt-8 border-b border-[#1F1F1F]">
            <div className="flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative px-4 py-3 text-sm font-semibold transition ${tab === t ? "text-white" : "text-[#A0A0A0] hover:text-white"}`}
                >
                  {t}
                  {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#32CC6F]" />}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-6">
            {tab === "About"   && <AboutTab group={group} />}
            {tab === "Stream"  && <StreamTab groupId={group.id} enrolled={enrolled} tutorId={group.tutor_id} />}
            {tab === "Ratings" && <RatingsTab groupId={group.id} rating={group.rating} ratingCount={group.ratingCount} />}
          </div>
        </div>

        <ClassEnrollmentCard
          c={{
            name: group.name,
            priceTTD: group.priceTTD,
            nextBilling: '—',
            enrolled,
            highlights: group.highlights,
            onJoin: handleJoin,
            joining,
            tutor: { name: group.tutorName, avatar: group.tutorAvatar, verified: group.tutorVerified, rating: group.rating, students: group.ratingCount },
          }}
        />
      </div>
    </ClassesShell>
  );
}

/* ─── About tab ─────────────────────────────────── */

function AboutTab({ group }: { group: Group }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3 text-sm leading-relaxed text-white/85">
        {group.description.split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
        {!group.description && <p className="text-[#A0A0A0]">No description provided.</p>}
      </div>
      {group.cover.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#A0A0A0]">What you'll cover</h3>
          <ul className="mt-3 space-y-2">
            {group.cover.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-white/85">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#32CC6F]" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-xl border border-[#1F1F1F] bg-[#111111] p-4">
        <div className="text-xs uppercase tracking-wider text-[#A0A0A0]">Schedule</div>
        <div className="mt-1 text-sm font-medium text-white">{group.schedule}</div>
      </div>
    </div>
  );
}

/* ─── Stream tab ────────────────────────────────── */

function StreamTab({ groupId, enrolled, tutorId }: { groupId: string; enrolled: boolean; tutorId: string }) {
  const { profile } = useProfile();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const isTutor = profile?.id === tutorId;
  const canView = enrolled || isTutor;

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    fetch(`/api/groups/${groupId}/stream`)
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(j => {
        const raw: any[] = j.posts ?? j.data ?? [];
        setPosts(raw.map((p: any): Post => {
          const author = Array.isArray(p.author) ? p.author[0] : p.author;
          const name = author?.full_name || author?.display_name || 'User';
          return {
            id: p.id, author: name, authorAvatar: author?.avatar_url,
            role: p.author_role === 'tutor' ? 'Tutor' : 'Student',
            time: formatRelative(p.created_at),
            type: capitalize(p.post_type) as Post['type'],
            body: p.message_body || p.body || '',
            replyCount: p.reply_count ?? 0,
          };
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [groupId, canView]);

  if (!canView) return (
    <div className="rounded-2xl border border-dashed border-[#1F1F1F] bg-[#111111] py-16 text-center text-sm text-[#A0A0A0]">
      Join the class to view the stream.
    </div>
  );
  if (loading) return <div className="py-8 text-center text-[#A0A0A0] text-sm">Loading stream…</div>;
  if (posts.length === 0) return (
    <div className="rounded-2xl border border-dashed border-[#1F1F1F] bg-[#111111] py-16 text-center text-sm text-[#A0A0A0]">
      No posts yet.
    </div>
  );

  return (
    <div className="space-y-4">
      {posts.map((p) => <PostCard key={p.id} post={p} groupId={groupId} />)}
    </div>
  );
}

function PostCard({ post, groupId }: { post: Post; groupId: string }) {
  const { profile } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyInput, setReplyInput] = useState('');
  const [sending, setSending] = useState(false);
  const [repliesLoaded, setRepliesLoaded] = useState(false);

  const loadReplies = async () => {
    if (repliesLoaded) { setExpanded(e => !e); return; }
    const { data } = await supabase
      .from('stream_replies')
      .select('id, message_body, created_at, author:profiles!stream_replies_author_id_fkey(full_name, display_name, avatar_url)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    setReplies((data ?? []).map((r: any): Reply => {
      const a = Array.isArray(r.author) ? r.author[0] : r.author;
      return { id: r.id, author: a?.full_name || a?.display_name || 'User', authorAvatar: a?.avatar_url, body: r.message_body, time: formatRelative(r.created_at) };
    }));
    setRepliesLoaded(true);
    setExpanded(true);
  };

  const sendReply = async () => {
    if (!replyInput.trim() || sending) return;
    setSending(true);
    const { data, error } = await supabase
      .from('stream_replies')
      .insert({ post_id: post.id, author_id: profile?.id, message_body: replyInput.trim() })
      .select('id, message_body, created_at, author:profiles!stream_replies_author_id_fkey(full_name)')
      .single();
    if (!error && data) {
      const a = Array.isArray(data.author) ? data.author[0] : data.author;
      setReplies(r => [...r, { id: data.id, author: a?.full_name || 'You', body: data.message_body, time: 'just now' }]);
      setReplyInput('');
    }
    setSending(false);
  };

  return (
    <article className="rounded-2xl border border-[#1F1F1F] bg-[#111111] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-[#1F1F1F] text-xs font-bold text-white/70 overflow-hidden">
            {post.authorAvatar ? <img src={post.authorAvatar} alt={post.author} className="size-full object-cover" /> : post.author.split(" ").map(s => s[0]).join("")}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{post.author}</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#A0A0A0]">{post.role}</span>
            </div>
            <div className="text-xs text-[#A0A0A0]">{post.time}</div>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${POST_COLORS[post.type] ?? POST_COLORS.Content}`}>
          {post.type}
        </span>
      </div>
      <p className="mt-4 text-sm text-white/85 leading-relaxed">{post.body}</p>
      <button onClick={loadReplies} className="mt-4 text-xs font-medium text-[#A0A0A0] hover:text-white">
        {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
      </button>
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-[#1F1F1F] pt-4">
          {replies.map(r => (
            <div key={r.id} className="flex items-start gap-2">
              <div className="grid size-7 place-items-center rounded-full bg-[#1F1F1F] text-[10px] font-bold text-white/70 overflow-hidden shrink-0">
                {r.authorAvatar ? <img src={r.authorAvatar} alt={r.author} className="size-full object-cover" /> : r.author.split(' ').map(s => s[0]).join('')}
              </div>
              <div className="rounded-lg bg-black/30 px-3 py-2 text-sm text-white/80 flex-1">
                <span className="font-medium text-white">{r.author}</span>
                <span className="text-[#A0A0A0] text-xs ml-2">{r.time}</span>
                <p className="mt-1">{r.body}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-[#1F1F1F] shrink-0" />
            <input
              type="text"
              value={replyInput}
              onChange={e => setReplyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendReply()}
              placeholder="Write a reply…"
              className="flex-1 rounded-full border border-[#1F1F1F] bg-black/40 px-4 py-2 text-sm text-white placeholder:text-[#A0A0A0] focus:outline-none focus:border-[#32CC6F]/60"
            />
            <button onClick={sendReply} disabled={sending || !replyInput.trim()} className="grid size-9 place-items-center rounded-full bg-[#32CC6F] text-black disabled:opacity-50">
              <Send className="size-4" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/* ─── Ratings tab ───────────────────────────────── */

function RatingsTab({ groupId, rating, ratingCount }: { groupId: string; rating: number; ratingCount: number }) {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [breakdown, setBreakdown] = useState<Breakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const PAGE = 10;

  const fetchRatings = useCallback(async (p: number) => {
    const from = (p - 1) * PAGE;
    const to = from + PAGE - 1;
    const { data, count } = await supabase
      .from('class_ratings')
      .select(`
        id, stars, comment, tutor_reply, created_at,
        student:profiles!class_ratings_student_id_fkey(full_name, avatar_url)
      `, { count: 'exact' })
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .range(from, to);

    const mapped = (data ?? []).map((r: any): Rating => {
      const s = Array.isArray(r.student) ? r.student[0] : r.student;
      return {
        id: r.id,
        name: s?.full_name || 'Student',
        stars: r.stars,
        date: new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        comment: r.comment,
        reply: r.tutor_reply ?? null,
      };
    });

    if (p === 1) {
      setRatings(mapped);
      // Build breakdown
      const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const r of mapped) dist[r.stars] = (dist[r.stars] ?? 0) + 1;
      const total = mapped.length || 1;
      setBreakdown([5,4,3,2,1].map(s => ({ stars: s, pct: Math.round(((dist[s] ?? 0) / total) * 100) })));
    } else {
      setRatings(prev => [...prev, ...mapped]);
    }
    setHasMore((count ?? 0) > to + 1);
    setLoading(false);
  }, [groupId]);

  useEffect(() => { fetchRatings(1); }, [fetchRatings]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRatings(nextPage);
  };

  if (loading) return <div className="py-8 text-center text-[#A0A0A0] text-sm">Loading ratings…</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 rounded-2xl border border-[#1F1F1F] bg-[#111111] p-6 sm:grid-cols-[180px_1fr]">
        <div className="flex flex-col items-center justify-center">
          <div className="text-5xl font-bold text-white">{ratingCount > 0 ? rating.toFixed(1) : '—'}</div>
          <StarRating value={rating} size={18} showNumber={false} />
          <div className="mt-1 text-xs text-[#A0A0A0]">{ratingCount} ratings</div>
        </div>
        <div className="space-y-2">
          {breakdown.map((b) => (
            <div key={b.stars} className="flex items-center gap-3 text-xs">
              <span className="w-6 text-[#A0A0A0]">{b.stars}★</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#1F1F1F]">
                <div className="h-full rounded-full bg-[#32CC6F]" style={{ width: `${b.pct}%` }} />
              </div>
              <span className="w-10 text-right tabular-nums text-[#A0A0A0]">{b.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {ratings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#1F1F1F] bg-[#111111] py-12 text-center text-sm text-[#A0A0A0]">
          No ratings yet.
        </div>
      ) : (
        <div className="space-y-4">
          {ratings.map((r) => (
            <div key={r.id} className="rounded-2xl border border-[#1F1F1F] bg-[#111111] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-full bg-[#1F1F1F] text-xs font-bold text-white/70">
                    {r.name.split(" ").map((s) => s[0]).join("")}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{r.name}</div>
                    <StarRating value={r.stars} size={12} showNumber={false} />
                  </div>
                </div>
                <span className="text-xs text-[#A0A0A0]">{r.date}</span>
              </div>
              {r.comment && <p className="mt-3 text-sm text-white/85">{r.comment}</p>}
              {r.reply && (
                <div className="mt-4 ml-8 rounded-xl border border-[#1F1F1F] bg-black/40 p-3">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-[#1F1F1F]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#32CC6F]">Tutor response</span>
                  </div>
                  <p className="mt-2 text-sm text-white/80">{r.reply}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="text-center">
          <button onClick={loadMore} className="rounded-full border border-[#1F1F1F] bg-[#111111] px-5 py-2.5 text-sm font-medium text-white hover:border-[#32CC6F]/40">
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ───────────────────────────────────── */

function formatRelative(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 3600000) return `${Math.max(1, Math.round(diff / 60000))}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.round(diff / 86400000)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}
