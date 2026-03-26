'use client';

import { useEffect, useState } from 'react';
import { getThreadReplies } from '@/lib/supabase/community-v2';
import type { SchoolCommunityMessageWithAuthor } from '@/lib/types/community-v2';
import NewMessageComposer from './NewMessageComposer';
import { getDisplayName } from '@/lib/utils/displayName';

interface ThreadRepliesProps {
  parentId: string;
  communityId: string;
  canReply: boolean;
  onReplyPosted?: () => void;
}

function displayName(author: SchoolCommunityMessageWithAuthor['author']) {
  if (!author) return 'Unknown';
  return getDisplayName(author as { full_name?: string; username?: string });
}

export default function ThreadReplies({ parentId, communityId, canReply, onReplyPosted }: ThreadRepliesProps) {
  const [replies, setReplies] = useState<SchoolCommunityMessageWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await getThreadReplies(parentId, { limit: 50 });
      setReplies(data);
      setLoading(false);
    })();
  }, [parentId]);

  return (
    <div className="ml-6 mt-2 pl-4 border-l-2 border-gray-200">
      {loading ? (
        <p className="text-sm text-gray-500">Loading replies...</p>
      ) : (
        <>
          {replies.map((r) => (
            <div key={r.id} className="py-2">
              <p className="text-sm font-medium text-gray-700">{displayName(r.author)}</p>
              <p className="text-sm text-gray-900">{r.content}</p>
              <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</p>
            </div>
          ))}
          {canReply && (
            <NewMessageComposer
              communityId={communityId}
              parentMessageId={parentId}
              placeholder="Write a reply..."
              onPosted={() => {
                getThreadReplies(parentId, { limit: 50 }).then(setReplies);
                onReplyPosted?.();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
