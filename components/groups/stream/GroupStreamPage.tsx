'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProfile } from '@/lib/hooks/useProfile';
import type { StreamPostWithAuthor } from '@/lib/types/groupStream';
import PostComposer from './PostComposer';
import StreamPostCard from './StreamPostCard';

interface GroupStreamPageProps {
  groupId: string;
  currentUserId: string;
  isTutor: boolean;
  authorName?: string;
  authorAvatarUrl?: string | null;
}

export default function GroupStreamPage({
  groupId,
  currentUserId,
  isTutor,
  authorName: authorNameProp,
  authorAvatarUrl: authorAvatarUrlProp,
}: GroupStreamPageProps) {
  const { profile } = useProfile();
  const authorName = authorNameProp ?? profile?.full_name ?? profile?.display_name ?? profile?.username ?? 'User';
  const authorAvatarUrl = authorAvatarUrlProp ?? profile?.avatar_url ?? null;
  const [posts, setPosts] = useState<StreamPostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchStream = useCallback(
    async (pageNum: number = 1, append: boolean = false) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await fetch(
          `/api/groups/${groupId}/stream?page=${pageNum}&limit=20`
        );
        if (!res.ok) return;
        const data = await res.json();
        const nextPosts = data.posts ?? [];
        setPosts((prev) => (append ? [...prev, ...nextPosts] : nextPosts));
        setHasMore(data.pagination?.has_more ?? false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [groupId]
  );

  useEffect(() => {
    fetchStream(1, false);
  }, [fetchStream]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchStream(nextPage, true);
  };

  const handlePosted = () => fetchStream(1, false);
  const handleDeleted = () => fetchStream(1, false);
  const handleReplyAdded = () => fetchStream(1, false);
  const handlePinToggled = () => fetchStream(1, false);

  return (
    <div className="space-y-4">
      <PostComposer
        groupId={groupId}
        currentUserId={currentUserId}
        isTutor={isTutor}
        authorName={authorName}
        authorAvatarUrl={authorAvatarUrl}
        onPosted={handlePosted}
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="text-4xl mb-3">📝</div>
          <p className="text-sm font-medium text-gray-600">No posts yet</p>
          <p className="text-xs text-gray-400 mt-1">
            {isTutor
              ? 'Create an announcement, share learning content, or start a discussion.'
              : 'Your tutor hasn\'t posted yet. You can start a discussion above.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {posts.map((post) => (
              <StreamPostCard
                key={post.id}
                post={post}
                isTutor={isTutor}
                currentUserId={currentUserId}
                onDeleted={handleDeleted}
                onReplyAdded={handleReplyAdded}
                onPinToggled={handlePinToggled}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm text-emerald-600 hover:underline font-medium disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
