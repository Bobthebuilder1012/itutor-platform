'use client';

import { useEffect, useState } from 'react';
import { useProfile } from '@/lib/hooks/useProfile';
import { getCommunityMessages, getMyMembership } from '@/lib/supabase/community-v2';
import type { SchoolCommunityMessageWithAuthor } from '@/lib/types/community-v2';
import { getDisplayName } from '@/lib/utils/displayName';
import ThreadReplies from './ThreadReplies';
import { supabase } from '@/lib/supabase/client';

interface FeedProps {
  communityId: string;
  refreshTrigger?: number;
}

function displayName(author: SchoolCommunityMessageWithAuthor['author']) {
  if (!author) return 'Unknown';
  return getDisplayName(author as { full_name?: string; username?: string });
}

export default function Feed({ communityId, refreshTrigger = 0 }: FeedProps) {
  const { profile } = useProfile();
  const [messages, setMessages] = useState<SchoolCommunityMessageWithAuthor[]>([]);
  const [membership, setMembership] = useState<Awaited<ReturnType<typeof getMyMembership>>>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);

  const canPost = membership?.status === 'ACTIVE';
  const isAdmin =
    membership?.role === 'ADMIN' ||
    profile?.role === 'admin' ||
    profile?.is_reviewer === true;

  const load = () => {
    getCommunityMessages(communityId, { limit: 50 }).then(setMessages);
    getMyMembership(communityId).then(setMembership);
  };

  useEffect(() => {
    setLoading(true);
    load();
    setLoading(false);
  }, [communityId, refreshTrigger]);

  const handlePinToggle = async (msg: SchoolCommunityMessageWithAuthor) => {
    if (!isAdmin || pinningId) return;
    setPinningId(msg.id);
    await supabase
      .from('school_community_messages')
      .update({ is_pinned: !msg.is_pinned })
      .eq('id', msg.id);
    setPinningId(null);
    load();
  };

  if (loading) {
    return <p className="text-gray-500">Loading feed...</p>;
  }

  if (messages.length === 0) {
    return <p className="text-gray-500">No messages yet. Be the first to post.</p>;
  }

  return (
    <div className="space-y-4">
      {messages.map((msg) => (
        <div key={msg.id} className="border border-gray-200 rounded-lg p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700">{displayName(msg.author)}</p>
              <p className="text-gray-900 mt-0.5">{msg.content}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(msg.created_at).toLocaleString()}</p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => handlePinToggle(msg)}
                disabled={!!pinningId}
                className="text-xs px-2 py-1 border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {msg.is_pinned ? 'Unpin' : 'Pin'}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
            className="text-sm text-itutor-green hover:underline mt-2"
          >
            {expandedId === msg.id ? 'Hide replies' : 'Replies'}
          </button>
          {expandedId === msg.id && (
            <ThreadReplies
              parentId={msg.id}
              communityId={communityId}
              canReply={!!canPost}
              onReplyPosted={load}
            />
          )}
        </div>
      ))}
    </div>
  );
}
