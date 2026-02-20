'use client';

import { useEffect, useState } from 'react';
import { getPinnedMessages } from '@/lib/supabase/community-v2';
import type { SchoolCommunityMessageWithAuthor } from '@/lib/types/community-v2';
import { getDisplayName } from '@/lib/utils/displayName';

interface PinsTabProps {
  communityId: string;
}

function displayName(author: SchoolCommunityMessageWithAuthor['author']) {
  if (!author) return 'Unknown';
  return getDisplayName(author as { full_name?: string; username?: string });
}

export default function PinsTab({ communityId }: PinsTabProps) {
  const [messages, setMessages] = useState<SchoolCommunityMessageWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPinnedMessages(communityId).then(setMessages).finally(() => setLoading(false));
  }, [communityId]);

  if (loading) return <p className="text-gray-500">Loading pins...</p>;
  if (messages.length === 0) return <p className="text-gray-500">No pinned messages.</p>;

  return (
    <div className="space-y-4">
      {messages.map((msg) => (
        <div key={msg.id} className="border border-gray-200 rounded-lg p-3">
          <p className="text-sm font-medium text-gray-700">{displayName(msg.author)}</p>
          <p className="text-gray-900 mt-0.5">{msg.content}</p>
          <p className="text-xs text-gray-400 mt-1">{new Date(msg.created_at).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}
