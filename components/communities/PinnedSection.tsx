'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import { formatMessageTime } from '@/lib/utils/communityTimestamp';
import type { CommunityMessageV2WithAuthor } from '@/lib/types/communities';
import UserAvatar from '@/components/UserAvatar';

interface PinnedSectionProps {
  communityId: string;
  className?: string;
}

export default function PinnedSection({ communityId, className = '' }: PinnedSectionProps) {
  const [pinned, setPinned] = useState<CommunityMessageV2WithAuthor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('community_messages_v2')
      .select('*, author:profiles(id, full_name, username, avatar_url)')
      .eq('community_id', communityId)
      .eq('is_pinned', true)
      .is('parent_message_id', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPinned((data as CommunityMessageV2WithAuthor[]) ?? []);
        setLoading(false);
      });
  }, [communityId]);

  if (loading || pinned.length === 0) return null;

  return (
    <section className={`rounded-2xl border border-amber-200 bg-amber-50/50 p-3 ${className}`}>
      <h3 className="text-sm font-semibold text-amber-800 mb-2">Pinned</h3>
      <ul className="space-y-2">
        {pinned.map((msg) => (
          <li key={msg.id} className="flex gap-2 text-sm">
            <UserAvatar
              avatarUrl={msg.author?.avatar_url}
              name={getDisplayName(msg.author as { full_name?: string; username?: string; display_name?: string })}
              size={32}
              className="bg-white"
            />
            <div className="min-w-0 flex-1">
              <span className="font-medium text-gray-900">
                {getDisplayName(msg.author as { full_name?: string; username?: string; display_name?: string })}
              </span>
              <span className="text-gray-500 ml-2">{formatMessageTime(msg.created_at)}</span>
              <p className="text-gray-700 mt-0.5 truncate">{msg.content}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
